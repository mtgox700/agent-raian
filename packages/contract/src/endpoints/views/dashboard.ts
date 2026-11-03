/** View endpoint: the data of the Dashboard home (/dashboard). */

import { z } from 'zod'
import { endpoint, IsoDate } from '../../define'

/** No workspace access: the page sends to onboarding. */
export const DashboardViewRedirect = z.object({ redirect: z.literal('/onboarding') })

export const DashboardMetric = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  previousValue: z.number().nullable(),
  unit: z.string().optional(),
  prefix: z.string().optional(),
  color: z.string(),
  trend: z.enum(['up', 'down', 'flat']),
  caption: z.string().optional(),
})

export const DashboardPipelineStage = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number(),
  value: z.number(),
  color: z.string(),
  percentage: z.number(),
})

export const DashboardActivityEvent = z.object({
  id: z.string(),
  type: z.enum(['lead_added', 'email_sent', 'reply_received', 'lead_qualified', 'campaign_launched', 'deal_closed', 'system']),
  title: z.string(),
  description: z.string(),
  timestamp: IsoDate,
  metadata: z.object({
    leadName: z.string().optional(),
    campaignName: z.string().optional(),
    amount: z.number().optional(),
  }).optional(),
})

export const DashboardChartPoint = z.object({
  date: z.string(),
  leads: z.number(),
  emails: z.number(),
  replies: z.number(),
  conversions: z.number(),
})

export const DashboardCampaign = z.object({
  id: z.string(),
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
  firstStepChannel: z.enum(['EMAIL', 'LINKEDIN', 'WHATSAPP', 'SMS']).optional(),
})

export const DashboardStats = z.object({
  metrics: z.array(DashboardMetric),
  pipeline: z.array(DashboardPipelineStage),
  recentActivity: z.array(DashboardActivityEvent),
  chartData: z.array(DashboardChartPoint),
  topCampaigns: z.array(DashboardCampaign),
  emailHealth: z.object({
    openRate: z.number(),
    clickRate: z.number(),
    deliveryRate: z.number(),
    bounceCount: z.number(),
    sentCount: z.number(),
  }),
  classifications: z.array(z.object({ label: z.string(), count: z.number(), color: z.string() })),
  todaySnapshot: z.object({ newLeads: z.number(), emailsSent: z.number(), replies: z.number() }),
})

export const dashboardViewEndpoints = [
  // app/api/views/dashboard/route.ts
  endpoint({
    id: 'views.dashboard',
    method: 'GET',
    path: '/api/views/dashboard',
    summary: 'Dashboard home: first name and real-time stats of what the viewer may see (`{ redirect }` without workspace access).',
    auth: 'session',
    response: z.union([
      DashboardViewRedirect,
      z.object({ firstName: z.string(), stats: DashboardStats }),
    ]),
  }),
]
