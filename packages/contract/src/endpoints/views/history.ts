/** View endpoints: the data of one front page, so pages never read the database. */

import { z } from 'zod'
import { endpoint, IsoDate } from '../../define'

export const HistoryEvent = z.object({
  id: z.string(),
  kind: z.enum(['campaign', 'reply', 'system']),
  title: z.string(),
  body: z.string().nullable(),
  href: z.string().optional(),
  createdAt: IsoDate,
})

export const historyViewEndpoints = [
  // app/api/views/history/route.ts
  endpoint({
    id: 'views.history',
    method: 'GET',
    path: '/api/views/history',
    summary: 'History page: notifications and campaign events, newest first (empty without workspace access).',
    auth: 'session',
    response: z.object({ events: z.array(HistoryEvent) }),
  }),
]
