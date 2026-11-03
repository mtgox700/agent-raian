/** In-app notifications. */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const NotificationType = z.enum([
  'LEAD_REPLIED_POSITIVE', 'LEAD_REPLIED_MEETING', 'LEAD_REPLIED_NEGATIVE', 'LEAD_REPLIED_NEUTRAL',
  'LEAD_CLICKED_WHATSAPP', 'MAILBOX_DISCONNECTED', 'MAILBOX_PAUSED', 'CAMPAIGN_COMPLETED',
  'QUOTA_WARNING', 'SDR_APPROVAL_NEEDED', 'EXPORT_READY', 'INSIGHT_ALERT',
])

/** NotificationItem (lib/services/notifications.service.ts). */
export const NotificationItem = z.object({
  id: Id,
  type: NotificationType,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  leadId: z.string().nullable(),
  campaignId: z.string().nullable(),
  readAt: IsoDate.nullable(),
  createdAt: IsoDate,
})

/** Payload of one `event: notification` SSE message (SSENotificationPayload). */
export const NotificationSseEvent = z.object({
  id: Id,
  type: NotificationType,
  title: z.string(),
  body: z.string(),
  createdAt: IsoDate,
  readAt: IsoDate.nullable(),
  leadId: z.string().nullable(),
  campaignId: z.string().nullable(),
})
