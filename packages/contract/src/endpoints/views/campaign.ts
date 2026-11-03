/** View endpoint of the Campaign detail page (apps/api/lib/views/campaign.ts). */

import { z } from 'zod'
import { endpoint, Id, IsoDate } from '../../define'
import { StepStats } from '../../schemas/campaign'
import { CompanySize } from '../../schemas/lead'
import { Plan } from '../../schemas/analyst'

/** `CampaignDetailData` (apps/api/lib/views/campaign.ts). */
export const CampaignDetail = z.object({
  id: Id,
  name: z.string(),
  status: z.string(),
  goal: z.string(),
  sentCount: z.number(),
  messagesByChannel: z.record(z.string(), z.number()),
  emailOpenedCount: z.number(),
  contactedCount: z.number(),
  repliedCount: z.number(),
  replyRate: z.object({ rate: z.number(), low: z.number(), high: z.number() }),
  convertedCount: z.number(),
  leadCount: z.number(),
  targetIndustry: z.string().nullable(),
  targetTitles: z.array(z.string()),
  targetCompanySizes: z.array(z.string()),
  targetGeos: z.array(z.string()),
  createdAt: IsoDate,
  completedAt: IsoDate.nullable(),
  lastProcessedAt: IsoDate.nullable(),
  leadSource: z.string(),
  sentEmailCount: z.number(),
  sentLinkedInCount: z.number(),
  replyEmailCount: z.number(),
  replyLinkedInCount: z.number(),
  stoppedOnReplyCount: z.number(),
})

/** `LeadRow` of the campaign page (apps/api/lib/views/campaign.ts). */
export const CampaignLeadRow = z.object({
  id: Id,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  status: z.string(),
  scoreBadge: z.string(),
  lastReplyAt: IsoDate.nullable(),
  lastReplyClassification: z.string().nullable(),
  industry: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  website: z.string().nullable(),
  country: z.string().nullable(),
  companySize: CompanySize.nullable(),
  source: z.string(),
  apolloId: z.string().nullable(),
  aiScore: z.number().nullable(),
  scoreReason: z.string().nullable(),
  createdAt: IsoDate,
  enrichment: z.object({
    emailVerified: z.boolean(),
    emailConfidence: z.number().nullable(),
    emailStatus: z.string().nullable(),
    headline: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    companyDescription: z.string().nullable().optional(),
    companyLinkedinUrl: z.string().nullable().optional(),
    technologies: z.array(z.string()).optional(),
  }).nullable(),
})

export const CampaignLeadCounts = z.object({
  total: z.number(),
  new: z.number(),
  contacted: z.number(),
  qualified: z.number(),
  converted: z.number(),
  lost: z.number(),
})

export const campaignViewEndpoints = [
  // app/api/views/campaign/[campaignId]/route.ts
  endpoint({
    id: 'views.campaign',
    method: 'GET',
    path: '/api/views/campaign/[campaignId]',
    summary: 'Campaign detail page: campaign figures, step stats, first 100 leads and counts. 404 outside the member\'s scope; `{ redirectTo }` without campaign access.',
    auth: 'session',
    params: z.object({ campaignId: Id }),
    response: z.union([
      z.object({ redirectTo: z.literal('/onboarding') }),
      z.object({
        campaign: CampaignDetail,
        stepStats: z.array(StepStats),
        leadCounts: CampaignLeadCounts,
        leads: z.array(CampaignLeadRow),
        workspaceId: Id,
        plan: Plan,
        pendingCount: z.number().int(),
        unverifiedCount: z.number().int(),
      }),
    ]),
  }),
]
