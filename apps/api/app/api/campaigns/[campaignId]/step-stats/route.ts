/**
 * GET /api/campaigns/:campaignId/step-stats
 *
 * Returns per-step analytics for a campaign:
 *  - Sent / delivered / opened / clicked / failed counts per step
 *  - Derived open rate, click rate, and reply rate per step
 *
 * Authentication: Clerk session required.
 * Authorization:  Campaign must belong to the caller's workspace.
 */

import { NextResponse }               from 'next/server'
import { auth }                       from '@clerk/nextjs/server'
import { db }                         from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { getCampaignStepStats }       from '@/lib/services/campaign-stats.service'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
): Promise<NextResponse> {
  const { campaignId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'campaign.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // Verify campaign belongs to this workspace
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, ...campaignScope(workspace) },
    select: {
      id:             true,
      name:           true,
      status:         true,
      goal:           true,
      sentCount:      true,
      openCount:      true,
      replyCount:     true,
      convertedCount: true,
      targetIndustry: true,
      createdAt:      true,
      completedAt:    true,
      lastProcessedAt: true,
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const stats = await getCampaignStepStats(db, campaignId)

  return NextResponse.json({
    campaign: {
      ...campaign,
      createdAt:       campaign.createdAt.toISOString(),
      completedAt:     campaign.completedAt?.toISOString() ?? null,
      lastProcessedAt: campaign.lastProcessedAt?.toISOString() ?? null,
    },
    stats,
  })
}
