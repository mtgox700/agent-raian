/**
 * Comparison mode: one group of campaigns against another, on the same
 * measures as the page (reply and positive reply at J+7, bounces).
 *
 * What differs between the two sides besides the message is computed, never
 * assumed absent: sending mailboxes, targeting, and the age of the cohorts
 * (checked by the facts engine). Nothing differs, as in a real A/B test: a
 * gap can be proven. Something differs: it stays "à surveiller", and the
 * page says what.
 */

import { compareRates, type Comparison } from '@/lib/analyst/facts/compare'
import type { Rate } from '@/lib/analyst/facts/campaign'
import type { Kpi } from './build'

export interface GroupProfile {
  label: string
  campaigns: number
  /** Sending mailbox per campaign ("partagé" when none is set). */
  mailboxes: string[]
  /** One signature per campaign: industry, titles, sizes, countries. */
  targeting: string[]
  /** Mean age, in days, of the leads first contacted in the period. */
  ageDays: number | null
}

export interface ComparedMeasure {
  key: 'reply' | 'positive' | 'bounce'
  label: string
  a: Rate
  b: Rate
  comparison: Comparison
}

export interface GroupComparison {
  a: { label: string; campaigns: number }
  b: { label: string; campaigns: number }
  measures: ComparedMeasure[]
  /** What differs besides the message; empty when nothing was found. */
  differences: string[]
}

export function targetingSignature(c: { targetIndustry: string | null; targetTitles: string[]; targetCompanySizes: string[]; targetGeos: string[] }): string {
  const norm = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))].sort()
  return JSON.stringify([c.targetIndustry?.trim().toLowerCase() ?? '', norm(c.targetTitles), norm(c.targetCompanySizes), norm(c.targetGeos)])
}

const sameSet = (x: string[], y: string[]) => {
  const a = new Set(x)
  const b = new Set(y)
  return a.size === b.size && [...a].every((v) => b.has(v))
}

export function differences(a: GroupProfile, b: GroupProfile): string[] {
  const out: string[] = []
  if (!sameSet(a.mailboxes, b.mailboxes)) out.push('boîtes d’envoi différentes')
  if (!sameSet(a.targeting, b.targeting)) out.push('ciblages différents')
  return out
}

const METRIC: Record<ComparedMeasure['key'], string> = { reply: 'reponse', positive: 'reponse_positive', bounce: 'rebond' }

export function buildGroupComparison(kpisA: Kpi[], kpisB: Kpi[], a: GroupProfile, b: GroupProfile): GroupComparison {
  const diffs = differences(a, b)
  const measures = (['reply', 'positive', 'bounce'] as const).flatMap((key): ComparedMeasure[] => {
    const ka = kpisA.find((k) => k.key === key)
    const kb = kpisB.find((k) => k.key === key)
    if (!ka?.rate || !kb?.rate) return []
    const comparison = compareRates(METRIC[key],
      { label: a.label, successes: ka.rate.successes, n: ka.rate.n, ageDays: a.ageDays ?? undefined },
      { label: b.label, successes: kb.rate.successes, n: kb.rate.n, ageDays: b.ageDays ?? undefined },
      // Bounces depend on the mailbox and the list, not on the message: the
      // same differences apply.
      { confounders: diffs })
    return [{ key, label: ka.label, a: ka.rate, b: kb.rate, comparison }]
  })
  return {
    a: { label: a.label, campaigns: a.campaigns },
    b: { label: b.label, campaigns: b.campaigns },
    measures,
    differences: [...new Set([...diffs, ...measures.flatMap((m) => m.comparison.confounders)])],
  }
}
