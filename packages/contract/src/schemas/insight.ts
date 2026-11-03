/** Insight (alert) shapes (apps/api/lib/insights). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const InsightActionKind = z.enum(['pause', 'change_sender', 'skip_segment', 'duplicate'])

export const InsightImpact = z.object({
  state: z.enum(['mesuré', 'trop tôt', 'sans effet', 'annulé']),
  text: z.string(),
})

export const InsightOpen = z.object({
  id: Id,
  kind: z.string(),
  severity: z.string(), // bloquant | alerte | opportunite
  title: z.string(),
  evidence: z.unknown(), // TODO(contract): Insight.evidence is a Json column with no single declared shape
  next: z.string(),
  campaignId: Id.nullable(),
  openedAt: IsoDate,
  lastSeenAt: IsoDate,
  campaignName: z.string().nullable(),
  actions: z.array(z.object({ kind: InsightActionKind, label: z.string(), confirm: z.string() })),
})

export const InsightRecentAction = z.object({
  id: Id,
  kind: InsightActionKind,
  label: z.string(),
  undoLabel: z.string().nullable(),
  undoBlocked: z.string().nullable(),
  campaignId: Id.nullable(),
  campaignName: z.string().nullable(),
  alert: z.string(),
  at: IsoDate,
  impact: InsightImpact,
  link: z.object({ href: z.string(), label: z.string() }).nullable(),
})
