/** Touches: the WhatsApp / SMS "A envoyer" queue. */

import { z } from 'zod'
import { endpoint, Id, Ok } from '../define'
import { QueuedTouch } from '../schemas/touch'

export const touchesEndpoints = [
  // app/api/touches/queue/route.ts
  endpoint({
    id: 'touches.queue',
    method: 'GET',
    path: '/api/touches/queue',
    summary: 'Queued WhatsApp/SMS drafts (up to 100); `?count=1` returns only the number (sidebar badge).',
    auth: 'session',
    query: z.object({ count: z.literal('1').optional() }),
    response: z.union([
      z.object({ ok: z.literal(true), items: z.array(QueuedTouch), remainingToday: z.number().int() }),
      z.object({ count: z.number().int() }),
    ]),
  }),

  // app/api/touches/[touchId]/sent/route.ts
  endpoint({
    id: 'touches.markSent',
    method: 'POST',
    path: '/api/touches/[touchId]/sent',
    summary: 'Mark a queued message as sent (body = message as possibly edited).',
    auth: 'session',
    params: z.object({ touchId: Id }),
    body: z.object({ body: z.string().max(2000) }),
    response: z.object({ ok: z.literal(true), remainingToday: z.number().int() }),
  }),

  // app/api/touches/[touchId]/skip/route.ts
  endpoint({
    id: 'touches.skip',
    method: 'POST',
    path: '/api/touches/[touchId]/skip',
    summary: 'Pass over a queued message: the sequence goes on to its next step.',
    auth: 'session',
    params: z.object({ touchId: Id }),
    response: Ok,
  }),
]
