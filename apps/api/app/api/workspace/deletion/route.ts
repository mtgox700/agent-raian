/**
 * GET    /api/workspace/deletion: whether a deletion is scheduled, and when.
 * POST   /api/workspace/deletion: { confirmName }: schedules it (owner only,
 *        recent verification, the workspace's name typed).
 * DELETE /api/workspace/deletion: cancels it within the 30 days.
 * The rules live in lib/privacy/workspace-deletion.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { requireStepUp } from '@/lib/auth/step-up'
import { stripe } from '@/lib/stripe/client'
import {
  DELETION_GRACE_DAYS, cancelWorkspaceDeletion, scheduleWorkspaceDeletion, type BillingApi, type DeletionError,
} from '@/lib/privacy/workspace-deletion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const billing = stripe as unknown as BillingApi

const MESSAGES: Record<DeletionError, [number, string]> = {
  NAME_MISMATCH:     [422, 'Le nom saisi ne correspond pas au nom de l’espace.'],
  ALREADY_SCHEDULED: [409, 'La suppression de cet espace est déjà programmée.'],
  NOT_SCHEDULED:     [409, 'Aucune suppression n’est programmée.'],
  NOT_FOUND:         [404, 'Espace de travail introuvable.'],
  TOO_LATE:          [409, 'Le délai de 30 jours est écoulé : la suppression est en cours.'],
}

function refused(error: DeletionError): NextResponse {
  const [status, message] = MESSAGES[error]
  return NextResponse.json({ error: message, code: error }, { status })
}

const postSchema = z.object({ confirmName: z.string().min(1).max(200) })

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'data.delete')
  if (!access.ok) return accessDenied(access)
  const w = await db.workspace.findUnique({
    where:  { id: access.ctx.workspaceId },
    select: { name: true, deletionRequestedAt: true, deletionScheduledFor: true },
  })
  return NextResponse.json({
    workspaceName: w?.name ?? '',
    graceDays:     DELETION_GRACE_DAYS,
    requestedAt:   w?.deletionRequestedAt ?? null,
    scheduledFor:  w?.deletionScheduledFor ?? null,
  })
}

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'data.delete')
  if (!access.ok) return accessDenied(access)
  const { ctx } = access

  const parsed = postSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Saisissez le nom de l’espace pour confirmer.' }, { status: 400 })

  const stepUp = await requireStepUp(db, ctx, { deny: { action: 'data.deletion_scheduled', target: { type: 'workspace', id: ctx.workspaceId }, req } })
  if (stepUp) return stepUp

  try {
    const result = await scheduleWorkspaceDeletion(db, billing, { workspaceId: ctx.workspaceId, userId: ctx.userId, confirmName: parsed.data.confirmName, req })
    if (!result.ok) return refused(result.error)
    return NextResponse.json({ ok: true, scheduledFor: result.scheduledFor, pausedCampaigns: result.pausedCampaigns })
  } catch (err) {
    console.error('[workspace/deletion] schedule failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'L’abonnement n’a pas pu être mis à jour : rien n’a été modifié, réessayez.' }, { status: 502 })
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'data.delete')
  if (!access.ok) return accessDenied(access)
  const { ctx } = access

  const stepUp = await requireStepUp(db, ctx, { recencyOnly: true })
  if (stepUp) return stepUp

  try {
    const result = await cancelWorkspaceDeletion(db, billing, { workspaceId: ctx.workspaceId, userId: ctx.userId, req })
    if (!result.ok) return refused(result.error)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[workspace/deletion] cancel failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'L’abonnement n’a pas pu être rétabli : réessayez.' }, { status: 502 })
  }
}
