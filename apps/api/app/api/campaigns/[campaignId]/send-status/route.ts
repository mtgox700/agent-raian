/**
 * GET /api/campaigns/:campaignId/send-status
 *
 * Queued messages of the campaign, the limit holding them (if any) and when
 * sending resumes. Polled by the campaign page while messages are queued.
 *
 * Authorization: the campaign must belong to the caller's workspace.
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { getSendStatus } from '@/lib/sequences/send-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'campaign.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const { campaignId } = await params
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, ...campaignScope(workspace) },
    select: { status: true },
  })
  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

  try {
    const status = await getSendStatus(db, {
      workspaceId: workspace.workspaceId,
      campaignId,
      campaignActive: campaign.status === 'ACTIVE',
    })
    return NextResponse.json(status)
  } catch (err: unknown) {
    console.error(`[send-status] campaignId=${campaignId}:`, err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Statut d\'envoi indisponible' }, { status: 500 })
  }
}
