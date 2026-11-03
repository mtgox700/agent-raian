/**
 * Data of the Campaign detail page (/dashboard/campaigns/[campaignId]),
 * served by GET /api/views/campaign/[campaignId].
 *
 * Step stats, leads, pending count and channel splits load in parallel.
 * Another member's campaign is a 404, like one that does not exist.
 */

import type { Plan, PrismaClient } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { SENDABLE_BADGES } from '@/lib/leads/badges'
import { emptyMetrics, getCampaignMetrics } from '@/lib/campaigns/metrics'
import { getCampaignStepStats, type StepStats } from '@/lib/services/campaign-stats.service'
import { parseEnrichmentExtras } from '@/lib/helpers/parse-enrichment-extras'
import type { CompanySize } from '@/lib/types/lead'

export interface CampaignDetailData {
  id:              string
  name:            string
  status:          string
  goal:            string
  /** Messages sent, every channel (lib/campaigns/metrics: from the rows). */
  sentCount:       number
  messagesByChannel: Record<string, number>
  emailOpenedCount: number
  /** Leads contacted (≥ 1 message sent) and leads who replied, refusals included. */
  contactedCount:  number
  repliedCount:    number
  /** replied / contacted, with its 95 % Wilson interval. */
  replyRate:       { rate: number; low: number; high: number }
  /** Leads of the campaign marked converted. */
  convertedCount:  number
  /** Leads in the campaign. */
  leadCount:       number
  targetIndustry:  string | null
  targetTitles:    string[]
  targetCompanySizes: string[]
  targetGeos:      string[]
  createdAt:       string
  completedAt:     string | null
  lastProcessedAt: string | null
  /** Only AI_PROSPECTING campaigns collect leads in the background. */
  leadSource:      string
  /** Channel splits: precise "X emails · Y messages LinkedIn" display. */
  sentEmailCount:     number
  sentLinkedInCount:  number
  replyEmailCount:    number
  replyLinkedInCount: number
  /** Leads whose sequence stopped automatically because they replied. */
  stoppedOnReplyCount: number
}

export interface LeadRow {
  id:                      string
  firstName:               string
  lastName:                string
  email:                   string
  company:                 string | null
  title:                   string | null
  status:                  string
  scoreBadge:              string
  lastReplyAt:             string | null
  lastReplyClassification: string | null
  // Lead detail drawer fields (parity with the leads page)
  industry:                string | null
  linkedinUrl:             string | null
  website:                 string | null
  country:                 string | null
  companySize:             CompanySize | null
  source:                  string
  apolloId:                string | null
  aiScore:                 number | null
  scoreReason:             string | null
  createdAt:               string
  enrichment: {
    emailVerified:       boolean
    emailConfidence:     number | null
    emailStatus:         string | null
    headline?:           string | null
    city?:               string | null
    companyDescription?: string | null
    companyLinkedinUrl?: string | null
    technologies?:       string[]
  } | null
}

export interface LeadCounts {
  total:     number
  new:       number
  contacted: number
  qualified: number
  converted: number
  lost:      number
}

export interface CampaignView {
  campaign:        CampaignDetailData
  stepStats:       StepStats[]
  leadCounts:      LeadCounts
  leads:           LeadRow[]
  workspaceId:     string
  plan:            Plan
  pendingCount:    number
  unverifiedCount: number
}

/** null when the campaign does not exist or is outside the member's scope (404). */
export async function campaignView(
  db: PrismaClient,
  workspace: AccessContext,
  campaignId: string,
): Promise<CampaignView | null> {
  // Load campaign: verify ownership
  const campaign = await db.campaign.findFirst({
    // Another member's campaign is a 404, like one that does not exist.
    where: { id: campaignId, ...campaignScope(workspace) },
    select: {
      id:                 true,
      name:               true,
      status:             true,
      goal:               true,
      targetIndustry:     true,
      targetTitles:       true,
      targetCompanySizes: true,
      targetGeos:         true,
      createdAt:          true,
      completedAt:        true,
      lastProcessedAt:    true,
      leadSource:         true,
    },
  })

  if (!campaign) return null

  // Load step stats + leads + pending count + channel splits in parallel
  const [
    statsResult, allLeads, statusCounts, pendingCount, unverifiedCount,
    metricsById, replyLinkedInCount, replyEmailCount, repliedLeads,
  ] = await Promise.all([
    getCampaignStepStats(db, campaign.id),

    db.lead.findMany({
      where:   { campaignId: campaign.id, workspaceId: workspace.workspaceId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take:    100,
      select: {
        id:                      true,
        firstName:               true,
        lastName:                true,
        email:                   true,
        company:                 true,
        title:                   true,
        status:                  true,
        scoreBadge:              true,
        lastReplyAt:             true,
        lastReplyClassification: true,
        // Extra fields for the lead detail drawer (parity with the leads page)
        industry:                true,
        linkedinUrl:             true,
        website:                 true,
        country:                 true,
        companySize:             true,
        source:                  true,
        apolloId:                true,
        aiScore:                 true,
        scoreReason:             true,
        createdAt:               true,
        enrichment:              true,
      },
    }),

    // True per-status totals: the list above only loads the first 100 leads,
    // and counting it showed "100 leads" for a 443-lead campaign.
    db.lead.groupBy({
      by:     ['status'],
      where:  { campaignId: campaign.id, workspaceId: workspace.workspaceId },
      _count: { _all: true },
    }),

    // Stuck PENDING: silently-failed sends that need a manual retry.
    // Exposed in UI as "X emails en attente: Relancer".
    db.emailSend.count({
      where: { campaignId: campaign.id, status: 'PENDING' },
    }),

    // Qualified leads with an UNCERTAIN email (held from auto-send to protect
    // deliverability). Surfaced as "X emails incertains : Contacter quand même".
    db.lead.count({
      where: {
        campaignId:   campaign.id,
        scoreBadge:   { in: [...SENDABLE_BADGES] },
        doNotContact: false,
        enrichment:   { emailStatus: 'unknown' }, // invalid addresses are never contactable
      },
    }),

    // Every headline figure from the rows (lib/campaigns/metrics), with the
    // split per channel: never the counters stored on Campaign.
    getCampaignMetrics(db, [campaign.id]),
    // LinkedIn replies carry fromEmail = `linkedin:<provider_id>`.
    db.emailReply.count({
      where: { campaignId: campaign.id, fromEmail: { startsWith: 'linkedin:' } },
    }),
    db.emailReply.count({
      where: { campaignId: campaign.id, NOT: { fromEmail: { startsWith: 'linkedin:' } } },
    }),
    // Every recorded reply stopped that lead's sequence (doNotContact).
    db.emailReply.findMany({
      where:    { campaignId: campaign.id },
      distinct: ['leadId'],
      select:   { leadId: true },
    }),
  ])

  // Lead counts by status
  const countByStatus: Record<string, number> = Object.fromEntries(
    statusCounts.map((row) => [row.status, row._count._all]),
  )

  const leadCounts: LeadCounts = {
    total:     statusCounts.reduce((sum, row) => sum + row._count._all, 0),
    new:       countByStatus['new']       ?? 0,
    contacted: countByStatus['contacted'] ?? 0,
    qualified: countByStatus['qualified'] ?? 0,
    converted: countByStatus['converted'] ?? 0,
    lost:      countByStatus['lost']      ?? 0,
  }

  const metrics = metricsById.get(campaign.id) ?? emptyMetrics()

  const campaignData: CampaignDetailData = {
    id:                 campaign.id,
    name:               campaign.name,
    status:             campaign.status.toLowerCase(),
    goal:               campaign.goal,
    sentCount:          metrics.messages.total,
    messagesByChannel:  metrics.messages.byChannel,
    emailOpenedCount:   metrics.email.opened,
    contactedCount:     metrics.contacted,
    repliedCount:       metrics.replied,
    replyRate:          { rate: metrics.replyRate.rate, low: metrics.replyRate.ci.low, high: metrics.replyRate.ci.high },
    // Leads marked converted: the stored counter was never incremented.
    convertedCount:     leadCounts.converted,
    leadCount:          leadCounts.total,
    targetIndustry:     campaign.targetIndustry,
    targetTitles:       campaign.targetTitles,
    targetCompanySizes: campaign.targetCompanySizes,
    targetGeos:         campaign.targetGeos,
    createdAt:          campaign.createdAt.toISOString(),
    completedAt:        campaign.completedAt?.toISOString()     ?? null,
    lastProcessedAt:    campaign.lastProcessedAt?.toISOString() ?? null,
    leadSource:         campaign.leadSource,
    sentEmailCount:     metrics.messages.byChannel.EMAIL ?? 0,
    sentLinkedInCount:  metrics.messages.byChannel.LINKEDIN ?? 0,
    replyEmailCount,
    replyLinkedInCount,
    stoppedOnReplyCount: repliedLeads.length,
  }

  const leads: LeadRow[] = allLeads.map((l) => ({
    id:                      l.id,
    firstName:               l.firstName,
    lastName:                l.lastName,
    email:                   l.email,
    company:                 l.company,
    title:                   l.title,
    status:                  l.status,
    scoreBadge:              l.scoreBadge,
    lastReplyAt:             l.lastReplyAt?.toISOString()  ?? null,
    lastReplyClassification: l.lastReplyClassification,
    // Drawer fields
    industry:                l.industry,
    linkedinUrl:             l.linkedinUrl,
    website:                 l.website,
    country:                 l.country,
    companySize:             l.companySize,
    source:                  l.source,
    apolloId:                l.apolloId,
    aiScore:                 l.aiScore,
    scoreReason:             l.scoreReason,
    createdAt:               l.createdAt.toISOString(),
    enrichment: l.enrichment
      ? {
          emailVerified:   l.enrichment.emailVerified,
          emailConfidence: l.enrichment.emailConfidence,
          emailStatus:     l.enrichment.emailStatus,
          ...parseEnrichmentExtras(l.enrichment.linkedinData),
        }
      : null,
  }))

  return {
    campaign:        campaignData,
    stepStats:       statsResult.steps,
    leadCounts,
    leads,
    workspaceId:     workspace.workspaceId,
    plan:            workspace.plan,
    pendingCount,
    unverifiedCount,
  }
}
