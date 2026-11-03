/**
 * POST /api/campaigns/[campaignId]/retry-pending
 *
 * "Envoyer maintenant" on the campaign page: starts the sending queue right
 * away for this campaign's queued messages instead of waiting for the next
 * minute. Nothing is sent inside this request; the queue sends at the
 * mailbox's own rhythm (lib/sequences/drip-queue). A paused campaign stays
 * paused: its queue waits until it is resumed.
 *
 * Auth: Clerk user must own the workspace that owns the campaign.
 *
 * Returns: { success, stats: { queued, active } }
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { seesCampaign } from '@/lib/auth/scope'
import { getClientKey, tooManyRequests } from '@/lib/security/rate-limit'
import { limit } from '@/lib/security/shared-rate-limit'
import { kickEmailDrip } from '@/lib/inngest/email-drip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ campaignId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const rl = await limit(getClientKey(req, userId), { windowSec: 60, max: 3, scope: 'campaign:retry-pending' })
  if (!rl.allowed) return tooManyRequests(rl, 3) as NextResponse

  const { campaignId } = await params

  const campaign = await db.campaign.findUnique({
    where:  { id: campaignId },
    select: { workspaceId: true, ownerUserId: true, status: true },
  })
  if (!campaign) {
    return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  }

  const workspaceAccess = await requireAccess(userId, 'campaign.launch', { workspaceId: campaign.workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  if (!seesCampaign(workspace, campaign)) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

  const queued = await db.emailSend.count({ where: { campaignId, status: 'PENDING' } })
  const active = campaign.status === 'ACTIVE'
  if (queued > 0 && active) await kickEmailDrip(`retry:${campaignId}`)

  return NextResponse.json({ success: true, stats: { queued, active } })
}
