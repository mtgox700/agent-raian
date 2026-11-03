/**
 * GET /api/workspace/export/[exportId]?e=…&s=…: downloads a ready export.
 *
 * Needs a session allowed to export in the workspace that owns it, verified
 * recently (the settings page confirms it before navigating here), and the
 * signed link (issued by us, for this export, not expired). A forwarded
 * link alone opens nothing; a stolen session without the recent
 * verification neither.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/audit'
import { checkStepUp } from '@/lib/auth/step-up'
import { verifyExportLink } from '@/lib/privacy/workspace-export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GONE = 'Ce lien d’export a expiré ou n’est pas valide. Relancez un export depuis Paramètres › Sécurité.'

export async function GET(req: Request, { params }: { params: Promise<{ exportId: string }> }): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'data.export')
  if (!access.ok) return accessDenied(access)

  const stepUp = await checkStepUp(db, access.ctx)
  if (stepUp !== 'OK') {
    return NextResponse.redirect(new URL(`/dashboard/settings?tab=security&export=${stepUp === 'TWO_FACTOR_REQUIRED' ? 'two_factor_required' : 'reverify'}`, req.url))
  }

  const { exportId } = await params
  const url = new URL(req.url)
  // The signature first, on the small columns: the archive is read only
  // for a valid link.
  const meta = await db.workspaceExport.findFirst({
    where:  { id: exportId, workspaceId: access.ctx.workspaceId, status: 'READY' },
    select: { id: true, expiresAt: true, createdAt: true },
  })
  if (!meta || !verifyExportLink(meta.id, meta.expiresAt, url.searchParams.get('e'), url.searchParams.get('s'))) {
    return NextResponse.json({ error: GONE }, { status: 410 })
  }
  const job = await db.workspaceExport.findUnique({ where: { id: meta.id }, select: { archive: true, createdAt: true } })
  if (!job?.archive) return NextResponse.json({ error: GONE }, { status: 410 })

  await recordAudit(db, access.ctx, { action: 'data.exported', target: { type: 'workspace', id: access.ctx.workspaceId }, req, details: { kind: 'full', exportId, downloaded: true } })
  return new NextResponse(job.archive, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="phantera-export-${job.createdAt.toISOString().slice(0, 10)}.zip"`,
      'Cache-Control':       'no-store',
    },
  })
}
