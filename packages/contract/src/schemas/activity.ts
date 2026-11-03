/** Activity feed (apps/api/lib/types/dashboard.ts). */

import { z } from 'zod'
import { IsoDate } from '../define'

export const ActivityType = z.enum([
  'lead_added', 'email_sent', 'reply_received', 'lead_qualified', 'campaign_launched', 'deal_closed', 'system',
])

export const ActivityEvent = z.object({
  id: z.string(),
  type: ActivityType,
  title: z.string(),
  description: z.string(),
  timestamp: IsoDate,
  metadata: z.object({
    leadName: z.string().optional(),
    campaignName: z.string().optional(),
    amount: z.number().optional(),
  }).optional(),
})
