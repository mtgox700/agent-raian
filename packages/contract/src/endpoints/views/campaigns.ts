/** View endpoint of the Campaigns page (apps/web/lib/views/campaigns.ts). */

import { z } from 'zod'
import { endpoint, Id, IsoDate } from '../../define'
import { StepChannel } from '../../schemas/campaign'

/** `Campaign` (apps/web/lib/types/dashboard.ts) as built by `campaignsView`. */
export const CampaignCard = z.object({
  id: Id,
  name: z.string(),
  status: z.enum(['draft', 'active', 'paused', 'completed']),
  targetCount: z.number(),
  contactedCount: z.number(),
  repliedCount: z.number().optional(),
  sentCount: z.number(),
  messagesByChannel: z.record(z.string(), z.number()).optional(),
  emailSentCount: z.number().optional(),
  emailOpenedCount: z.number().optional(),
  openRate: z.number(),
  replyRate: z.number(),
  conversionRate: z.number(),
  startDate: IsoDate,
  endDate: IsoDate.optional(),
  industry: z.string(),
  aiPersonalization: z.boolean(),
  qualifiedLeadsCount: z.number(),
  firstStepChannel: StepChannel.optional(),
})

export const campaignsViewEndpoints = [
  // app/api/views/campaigns/route.ts
  endpoint({
    id: 'views.campaigns',
    method: 'GET',
    path: '/api/views/campaigns',
    summary: 'Campaigns page: campaigns of the member\'s scope with their figures, and e-mails left this month (empty without campaign access).',
    auth: 'session',
    response: z.object({
      campaigns: z.array(CampaignCard),
      workspaceId: z.string(),
      emailsRemaining: z.number().nullable(),
    }),
  }),
]
