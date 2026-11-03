/**
 * Data of the Campaigns page (/dashboard/campaigns), served by GET /api/views/campaigns.
 *
 * Every figure from the rows, in a few grouped queries whatever the volume
 * (lib/campaigns/metrics): never the counters stored on Campaign, never
 * thousands of ids sent back to the database.
 */

import type { PrismaClient } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { cardFigures, getAwaitingFirstStep, getCampaignMetrics, emptyMetrics } from '@/lib/campaigns/metrics'
import { checkEmailSendQuota } from '@/lib/stripe/quota'
import type { Campaign } from '@/lib/types/dashboard'

export interface CampaignsView {
  campaigns: Campaign[]
  workspaceId: string
  /** null only when the plan has no monthly e-mail limit. */
  emailsRemaining: number | null
}

/** Without campaign access the page shows an empty list, as before. */
export const EMPTY_CAMPAIGNS_VIEW: CampaignsView = { campaigns: [], workspaceId: '', emailsRemaining: null }

export async function campaignsView(db: PrismaClient, workspace: AccessContext): Promise<CampaignsView> {
  const workspaceId = workspace.workspaceId

  const dbCampaigns = await db.campaign.findMany({
    where: campaignScope(workspace),
    include: {
      _count: { select: { leads: true } },
      emailSteps: { select: { id: true, channel: true }, orderBy: { position: 'asc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  const campaignIds = dbCampaigns.map((c) => c.id)

  const [metrics, awaiting, emailQuota] = await Promise.all([
    getCampaignMetrics(db, campaignIds),
    getAwaitingFirstStep(db, campaignIds),
    checkEmailSendQuota(workspaceId),
  ])
  const emailsRemaining = emailQuota.limit === Infinity
    ? null
    : Math.max(0, emailQuota.limit - emailQuota.current)

  const campaigns: Campaign[] = dbCampaigns.map((c) => {
    const m = metrics.get(c.id) ?? emptyMetrics()
    return {
      id: c.id,
      name: c.name,
      status: c.status.toLowerCase() as Campaign['status'],
      targetCount: c._count.leads,
      ...cardFigures(m),
      startDate: c.createdAt.toISOString(),
      industry: c.targetIndustry ?? '',
      aiPersonalization: true,
      qualifiedLeadsCount: awaiting.get(c.id) ?? 0,
      firstStepChannel: c.emailSteps[0]?.channel ?? 'EMAIL',
    }
  })

  return { campaigns, workspaceId, emailsRemaining }
}
