/** Inbox: replies to campaigns. */

import { z } from 'zod'
import { endpoint, Id, Ok } from '../define'

export const inboxEndpoints = [
  // app/api/inbox/[replyId]/read/route.ts
  endpoint({
    id: 'inbox.markRead',
    method: 'POST',
    path: '/api/inbox/[replyId]/read',
    summary: 'Mark a reply as read (Business plan and above, else 402).',
    auth: 'session',
    params: z.object({ replyId: Id }),
    response: Ok,
  }),

  // app/api/inbox/unread-count/route.ts
  endpoint({
    id: 'inbox.unreadCount',
    method: 'GET',
    path: '/api/inbox/unread-count',
    summary: 'Unread replies for the sidebar badge (0 on plans without the inbox).',
    auth: 'session',
    response: z.object({ count: z.number().int() }),
  }),
]
