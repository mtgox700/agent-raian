/**
 * GET  /api/workspace/export: the workspace's recent exports, with a signed
 *      download link for the ready ones.
 * POST /api/workspace/export: asks for a full export (owners and admins,
 *      after a recent verification). Built in the background; one at a time,
 *      3 per day.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { requireStepUp } from '@/lib/auth/step-up'
import { recordAudit } from '@/lib/audit/audit'
import { inngest, WORKSPACE_EXPORT_EVENT } from '@/lib/inngest/client'
import { EXPORT_STALE_MS, EXPORT_TTL_DAYS, EXPORTS_PER_DAY, signedExportPath } from '@/lib/privacy/workspace-export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'data.export')
  if (!access.ok) return accessDenied(access)

  const rows = await db.workspaceExport.findMany({
    where:   { workspaceId: access.ctx.workspaceId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take:    10,
    select:  { id: true, status: true, sizeBytes: true, createdAt: true, completedAt: true, expiresAt: true },
  })
  // A job lost on the way shows as failed, not « en préparation » forever.
  const staleBefore = Date.now() - EXPORT_STALE_MS
  return NextResponse.json({
    exports: rows.map((r) => ({
      ...r,
      status: r.status === 'PENDING' && r.createdAt.getTime() < staleBefore ? 'FAILED' : r.status,
      url:    r.status === 'READY' ? signedExportPath(r.id, r.expiresAt) : null,
    })),
  })
}

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'data.export')
  if (!access.ok) return accessDenied(access)
  const { ctx } = access

  const stepUp = await requireStepUp(db, ctx, { deny: { action: 'data.exported', target: { type: 'workspace', id: ctx.workspaceId }, req, details: { kind: 'full' } } })
  if (stepUp) return stepUp

  // Checked and created under a per-workspace lock: parallel requests
  // cannot slip past the one-at-a-time and daily limits.
  const decision = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace-export:${ctx.workspaceId}`}))`
    const [pending, today] = await Promise.all([
      tx.workspaceExport.count({ where: { workspaceId: ctx.workspaceId, status: 'PENDING', createdAt: { gt: new Date(Date.now() - EXPORT_STALE_MS) } } }),
      tx.workspaceExport.count({ where: { workspaceId: ctx.workspaceId, createdAt: { gt: new Date(Date.now() - DAY_MS) } } }),
    ])
    if (pending > 0) return { ok: false as const, refused: NextResponse.json({ error: 'Un export est déjà en préparation.' }, { status: 409 }) }
    if (today >= EXPORTS_PER_DAY) return { ok: false as const, refused: NextResponse.json({ error: `${EXPORTS_PER_DAY} exports par jour au plus : réessayez demain.` }, { status: 429 }) }
    return {
      ok:  true as const,
      job: await tx.workspaceExport.create({
        data:   { workspaceId: ctx.workspaceId, requestedById: ctx.userId, expiresAt: new Date(Date.now() + EXPORT_TTL_DAYS * DAY_MS) },
        select: { id: true },
      }),
    }
  })
  if (!decision.ok) return decision.refused
  const { job } = decision
  try {
    await inngest.send({ name: WORKSPACE_EXPORT_EVENT, data: { exportId: job.id } })
  } catch (err) {
    console.error('[workspace/export] could not queue:', err instanceof Error ? err.message : String(err))
    await db.workspaceExport.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'queue unavailable', completedAt: new Date() } })
    return NextResponse.json({ error: 'L’export n’a pas pu être lancé : réessayez dans quelques minutes.' }, { status: 503 })
  }

  await recordAudit(db, ctx, { action: 'data.exported', target: { type: 'workspace', id: ctx.workspaceId }, req, details: { kind: 'full', exportId: job.id } })
  return NextResponse.json({ id: job.id, status: 'PENDING' }, { status: 202 })
}
