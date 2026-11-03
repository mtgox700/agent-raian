/**
 * Two alerts that point to a choice rather than a breakdown:
 *
 *   segment_sous_performant  inside one campaign, a segment (industry, size,
 *     country, score) replies less than the rest, proven by the test (same
 *     campaign: same message, mailbox and period, so no confounder), and some
 *     of its first messages are still waiting: they can be taken off the queue.
 *   campagne_gagnante  a campaign replies clearly more than the others. Across
 *     campaigns the message, period and targeting differ: never "proven",
 *     always "to confirm", which is what a copy on a new segment does.
 */

import { compareSegments, MIN_SAMPLE } from '@/lib/analyst/facts/compare'
import type { CampaignFacts } from '@/lib/analyst/facts/campaign'
import type { LeaderRow } from '@/lib/analytics/build'
import type { Rate } from '@/lib/analyst/facts/campaign'
import type { DetectedInsight } from './detect'

export const SEGMENT_DIMENSIONS = ['industry', 'companySize', 'country', 'scoreBadge'] as const
export type SegmentDimension = (typeof SEGMENT_DIMENSIONS)[number]

/** First messages of a segment still waiting, below which taking them off is not worth an alert. */
export const MIN_PENDING = 20
/** Measured leads below which a campaign is not called a winner. */
export const MIN_WINNER_LEADS = 100

const DIMENSION_WORD: Record<SegmentDimension, string> = { industry: 'secteur', companySize: 'taille d’entreprise', country: 'pays', scoreBadge: 'score' }
const SIZE: Record<string, string> = { XS: '1 à 10', S: '11 à 50', M: '51 à 200', L: '201 à 1 000', XL: 'plus de 1 000' }
const BADGE: Record<string, string> = { FAST_TRACK: 'Fast Track', NORMAL: 'Normal', NURTURE: 'Nurture', SKIP: 'Écarté', UNSCORED: 'non scoré' }

export function segmentLabel(dimension: SegmentDimension, value: string): string {
  if (dimension === 'companySize') return SIZE[value] ?? value
  if (dimension === 'scoreBadge') return BADGE[value] ?? value
  return value.charAt(0).toLocaleUpperCase('fr-FR') + value.slice(1)
}

/** The segment is carried by the key: the action reads it back, encoded so no value can break the key. */
export function segmentKey(campaignId: string, dimension: SegmentDimension, value: string): string {
  return `segment_sous_performant:${campaignId}:${dimension}:${encodeURIComponent(value)}`
}

export function parseSegmentKey(key: string): { campaignId: string; dimension: SegmentDimension; value: string } | null {
  const [kind, campaignId, dimension, value] = key.split(':')
  if (kind !== 'segment_sous_performant' || !campaignId || value === undefined) return null
  if (!(SEGMENT_DIMENSIONS as readonly string[]).includes(dimension)) return null
  try { return { campaignId, dimension: dimension as SegmentDimension, value: decodeURIComponent(value) } } catch { return null }
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`
const nf = (n: number) => n.toLocaleString('fr-FR')

export type PendingBySegment = Record<SegmentDimension, Map<string, number>>

/** At most one per campaign: the proven-worse segment with the most first messages waiting. */
export function detectSegment(facts: CampaignFacts, pending: PendingBySegment): DetectedInsight | null {
  const id = facts.campaign.id
  let best: { dimension: SegmentDimension; value: string; waiting: number; rate: Rate; rest: Rate } | null = null
  for (const dimension of SEGMENT_DIMENSIONS) {
    const known = facts.targeting[dimension].filter((s) => !s.unknown && s.contacted > 0)
    if (known.length < 2) continue
    const total = known.reduce((a, s) => ({ r: a.r + s.replied, n: a.n + s.contacted }), { r: 0, n: 0 })
    // Same campaign on both sides: nothing else differs (confounders checked, none).
    const tests = compareSegments('reponse', known.map((s) => ({
      arm: { label: s.value, successes: s.replied, n: s.contacted },
      rest: { label: 'le reste', successes: total.r - s.replied, n: total.n - s.contacted },
      confounders: [] as string[],
    })))
    known.forEach((s, i) => {
      const t = tests[i]
      const waiting = pending[dimension].get(s.value) ?? 0
      if (t.verdict !== 'significatif' || t.delta >= 0 || waiting < MIN_PENDING) return
      if (!best || waiting > best.waiting) best = { dimension, value: s.value, waiting, rate: t.a as Rate, rest: t.b as Rate }
    })
  }
  if (!best) return null
  const b = best as { dimension: SegmentDimension; value: string; waiting: number; rate: Rate; rest: Rate }
  const label = segmentLabel(b.dimension, b.value)
  return {
    key: segmentKey(id, b.dimension, b.value), kind: 'segment_sous_performant', severity: 'alerte', campaignId: id,
    title: `Le ${DIMENSION_WORD[b.dimension]} « ${label} » ne répond pas à « ${facts.campaign.name} »`,
    evidence: [
      `${pct(b.rate.rate)} de réponse (${nf(b.rate.successes)}/${nf(b.rate.n)}) contre ${pct(b.rest.rate)} pour le reste de la campagne`,
      'écart démontré par le test, même campagne des deux côtés',
      `${nf(b.waiting)} premiers messages de ce segment attendent encore`,
    ],
    next: 'Retirer ces premiers messages de la file pour garder le quota et la réputation de la boîte pour les segments qui répondent.',
    notify: true,
    actions: ['skip_segment'],
  }
}

export function detectWinners(ranked: LeaderRow[], pooled: Rate): DetectedInsight[] {
  return ranked
    .filter((r) => r.direction === 'au-dessus' && (r.verdict === 'tendance' || r.verdict === 'significatif') && r.rate.n >= Math.max(MIN_SAMPLE, MIN_WINNER_LEADS))
    .map((r) => ({
      key: `campagne_gagnante:${r.campaignId}`, kind: 'campagne_gagnante' as const, severity: 'opportunite' as const, campaignId: r.campaignId,
      title: `« ${r.name} » répond nettement mieux que vos autres campagnes`,
      evidence: [
        `${pct(r.rate.rate)} de réponse à J+7 (${nf(r.rate.successes)}/${nf(r.rate.n)}, IC 95 % ${pct(r.rate.ci.low)} à ${pct(r.rate.ci.high)}) contre ${pct(pooled.rate)} pour l’ensemble`,
        'à confirmer : message, période et ciblage diffèrent entre campagnes',
      ],
      next: 'Dupliquer la campagne pour la tester sur un nouveau segment : même message, même expéditeur, un autre ciblage.',
      notify: true,
      actions: ['duplicate'],
    }))
}
