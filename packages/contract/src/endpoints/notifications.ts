/** In-app notifications: list, mark read, live stream. */

import { z } from 'zod'
import { endpoint, Id, IsoDate, Ok } from '../define'
import { NotificationItem, NotificationSseEvent } from '../schemas/notifications'

export const notificationsEndpoints = [
  // app/api/notifications/route.ts
  endpoint({
    id: 'notifications.list',
    method: 'GET',
    path: '/api/notifications',
    summary: 'Notifications of the caller (newest first) and the unread count.',
    auth: 'session',
    query: z.object({
      /** Only the literal "true" filters; anything else lists all. */
      unread: z.string().optional(),
      /** Integer, clamped to 1..50 (default 20). */
      limit: z.string().optional(),
    }),
    response: z.object({ notifications: z.array(NotificationItem), unreadCount: z.number().int() }),
  }),

  // app/api/notifications/[id]/read/route.ts
  endpoint({
    id: 'notifications.markRead',
    method: 'POST',
    path: '/api/notifications/[id]/read',
    summary: 'Mark one notification as read.',
    auth: 'session',
    params: z.object({ id: Id }),
    response: Ok,
  }),

  // app/api/notifications/read-all/route.ts
  endpoint({
    id: 'notifications.markAllRead',
    method: 'POST',
    path: '/api/notifications/read-all',
    summary: 'Mark every unread notification as read.',
    auth: 'session',
    response: Ok,
  }),

  // app/api/notifications/stream/route.ts
  endpoint({
    id: 'notifications.stream',
    method: 'GET',
    path: '/api/notifications/stream',
    summary: 'Server-Sent Events: `event: notification` per new notification; closes after 20 s, EventSource reconnects.',
    auth: 'session',
    query: z.object({
      /** ISO timestamp cursor; invalid or missing = last 60 s. */
      since: IsoDate.optional(),
    }),
    response: NotificationSseEvent,
    responseKind: 'stream',
  }),
]
