/** Analyst shapes (apps/api/lib/analyst). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const Plan = z.enum(['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'])

export const Suggestion = z.object({
  label: z.string(),
  question: z.string(),
  tone: z.enum(['bloquant', 'alerte', 'neutre']),
})

/** `QuotaState`, with `resetsAt` as it travels in JSON. */
export const AnalystQuota = z.object({
  used: z.number(),
  limit: z.number(),
  remaining: z.number(),
  resetsAt: IsoDate,
})

export const ConversationSummary = z.object({ id: Id, title: z.string(), updatedAt: IsoDate })

export const AnalystMessage = z.object({
  id: Id,
  role: z.string(), // 'user' | 'assistant'
  content: z.string(),
  status: z.string().nullable(), // ok | insufficient | refused | error (assistant only)
  evidence: z.unknown(), // Json column: array of { ref, tool, data } for assistant answers
  createdAt: IsoDate,
})
