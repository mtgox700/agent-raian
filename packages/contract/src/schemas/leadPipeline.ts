/** Lead pipeline shapes: scoring, enrichment, hot leads, search stream (mirror of apps/api/lib/types/lead.ts). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'
import { LeadRow, LeadScoreBadge } from './lead'

export const ScoreDistribution = z.object({
  FAST_TRACK: z.number().int(),
  NORMAL: z.number().int(),
  NURTURE: z.number().int(),
  SKIP: z.number().int(),
  UNSCORED: z.number().int(),
})

export const EmailEnrichResult = z.object({
  leadId: Id,
  emailVerified: z.boolean(),
  emailConfidence: z.number(),
  emailStatus: z.string(),
})

/** `HotLead` (apps/api/lib/repositories/leads.repository.ts). */
export const HotLead = z.object({
  id: Id,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  status: z.string(),
  lastReplyAt: IsoDate.nullable(),
  lastReplyClassification: z.string().nullable(),
  lastReplySnippet: z.string().nullable(),
  qualifiedAt: IsoDate.nullable(),
  campaignName: z.string().nullable(),
  aiScore: z.number().nullable(),
  industry: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  website: z.string().nullable(),
})

/** Lead the campaign wizard can pick from the existing base. */
export const AvailableLead = z.object({
  id: Id,
  firstName: z.string(),
  lastName: z.string(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  aiScore: z.number().nullable(),
  scoreBadge: LeadScoreBadge,
})

/** One SSE event of the search pipeline (`PipelineEvent`), sent as `data: <json>\n\n`. */
export const PipelineEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('search_start'), total: z.number() }),
  z.object({ type: z.literal('search_progress'), found: z.number() }),
  z.object({ type: z.literal('search_done'), saved: z.number(), duplicates: z.number() }),
  z.object({ type: z.literal('enrich_start'), total: z.number() }),
  z.object({ type: z.literal('enrich_progress'), enriched: z.number(), total: z.number() }),
  z.object({ type: z.literal('enrich_done'), verified: z.number(), total: z.number() }),
  z.object({ type: z.literal('score_start'), total: z.number() }),
  z.object({ type: z.literal('score_progress'), scored: z.number(), total: z.number() }),
  z.object({ type: z.literal('score_done'), distribution: ScoreDistribution }),
  z.object({
    type: z.literal('pipeline_done'),
    leads: z.array(LeadRow),
    summary: z.object({
      totalFound: z.number(),
      totalSaved: z.number(),
      totalEnriched: z.number(),
      distribution: ScoreDistribution,
    }),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
