/** Campaign shapes (campaign status, sender, send status, step stats). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const StatusAction = z.enum(['pause', 'resume', 'complete'])

/** `changeCampaignStatus` (apps/api/lib/campaigns/status.ts): selected campaign columns. */
export const CampaignStatusChange = z.object({
  id: Id,
  status: z.string(),
  completedAt: IsoDate.nullable(),
})

export const SendHold = z.enum([
  'CAMPAIGN_PAUSED', 'QUOTA', 'MAILBOX_DISCONNECTED', 'NO_SENDER', 'MAILBOX_PAUSED', 'MAILBOX_CAP', 'SHARED_CAP',
])

/** `getSendStatus` (apps/api/lib/sequences/send-status.ts). */
export const SendStatus = z.object({
  queued: z.number().int(),
  hold: SendHold.nullable(),
  resumesAt: IsoDate.nullable(),
  sender: z.string().nullable(),
  sentLast24h: z.number().int(),
  dailyLimit: z.number(),
  quota: z.object({ current: z.number(), limit: z.number().nullable() }),
})

/** `SendEstimate` (apps/api/lib/sequences/launch-estimate.ts). */
export const SendEstimate = z.object({
  dailyLimit: z.number(),
  today: z.number(),
  minutesToday: z.number(),
  days: z.number(),
  sender: z.string().nullable(),
  pausedUntil: IsoDate.nullable(),
})

export const StepChannel = z.enum(['EMAIL', 'LINKEDIN', 'WHATSAPP', 'SMS'])

/** `StepStats` (apps/api/lib/services/campaign-stats.service.ts). */
export const StepStats = z.object({
  stepId: Id,
  position: z.number().int(),
  dayOffset: z.number(),
  channel: StepChannel,
  subject: z.string(),
  body: z.string(),
  totalSent: z.number(),
  delivered: z.number(),
  opened: z.number(),
  clicked: z.number(),
  failed: z.number(),
  queued: z.number(),
  replyCount: z.number(),
  openRate: z.number(),
  clickRate: z.number(),
  replyRate: z.number(),
})
