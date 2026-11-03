/** View endpoint of the Reply Inbox page (/dashboard/inbox), so the page never reads the database. */

import { z } from 'zod'
import { endpoint, Id, IsoDate } from '../../define'

export const ReplyClassification = z.enum(['POSITIVE', 'MEETING_REQUEST', 'NEGATIVE', 'NOT_INTERESTED', 'NEUTRAL'])
export const ReplyFilter = z.enum(['all', 'positive', 'meeting', 'negative', 'unread'])

/** `InboxReplyRow` (apps/web/lib/repositories/replies.repository.ts), date as ISO string. */
export const InboxReply = z.object({
  id: Id,
  receivedAt: IsoDate,
  fromEmail: z.string(),
  bodySnippet: z.string(),
  classification: ReplyClassification,
  confidence: z.number(),
  isRead: z.boolean(),
  lead: z.object({
    id: Id,
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    company: z.string().nullable(),
    title: z.string().nullable(),
    industry: z.string().nullable(),
    aiScore: z.number().nullable(),
  }),
  campaign: z.object({ id: Id, name: z.string() }),
  emailSend: z.object({ id: Id, subject: z.string().nullable() }).nullable(),
})

export const inboxViewEndpoints = [
  // app/api/views/inbox/route.ts
  endpoint({
    id: 'views.inbox',
    method: 'GET',
    path: '/api/views/inbox',
    summary: 'Reply Inbox page: one page of replies (Business plan and above, else `locked`); `redirectTo` without inbox access.',
    auth: 'session',
    query: z.object({ filter: z.string().optional(), page: z.string().optional() }),
    response: z.union([
      z.object({
        locked: z.literal(false),
        replies: z.array(InboxReply),
        total: z.number().int(),
        page: z.number().int(),
        totalPages: z.number().int(),
        filter: ReplyFilter,
      }),
      z.object({ locked: z.literal(true), businessPrice: z.number(), businessAnnualDiscount: z.number() }),
      z.object({ redirectTo: z.literal('/onboarding') }),
    ]),
  }),
]
