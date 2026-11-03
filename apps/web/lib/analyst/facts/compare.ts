/**
 * Comparing two rates the way Okafor allows it to be said to a customer.
 *
 * Every comparison returns the gap AND how much it can be trusted:
 *   - 'insuffisant': too few sends on one side, or no evidence of a gap.
 *     A valid answer, never an error: "not enough data yet" is what the
 *     Analyst must say about a young campaign.
 *   - 'tendance': to watch, NOT demonstrated (p < 0.2 is roughly one false
 *     alarm in five): never presented as "more effective". Also the ceiling
 *     of a significant gap that a confounder could explain on its own, or
 *     whose confounders were not evaluated.
 *
 * The unit is the LEAD (contacted leads, leads who replied), never the
 * message: several messages go to one lead, and counting them would inflate
 * significance. Confounders are required: the caller states what differs
 * between the two sides, or says it did not evaluate it: absent
 * information never reads as "nothing else differs".
 *   - 'significatif': p < 0.05 after correction, enough sends, nothing
 *     else differing between the two sides.
 * The difference carries Newcombe's hybrid score interval (built on the two
 * Wilson intervals), which stays inside [-1, 1] and behaves at 0 %.
 */

import { benjaminiHochberg, compareProportions, wilson, type Counts, type Interval } from './stats'

export type Verdict = 'significatif' | 'tendance' | 'insuffisant'

/** Sends per side below which no claim is made. */
export const MIN_SAMPLE = 30
export const ALPHA = 0.05
export const TREND_ALPHA = 0.2
/** Two cohorts whose ages differ by more than this are not compared as equals. */
export const MAX_AGE_GAP = 0.2

/** successes = leads who replied (or bounced…), n = leads contacted. */
export interface Arm extends Counts {
  label: string
  /** Days since the cohort's first send, when known (J+7 vs J+7). */
  ageDays?: number
}

export interface RateFact {
  label: string
  successes: number
  n: number
  rate: number
  ci: Interval
}

export interface Comparison {
  metric: string
  a: RateFact
  b: RateFact
  /** a.rate − b.rate */
  delta: number
  deltaCi: Interval
  pValue: number | null
  /** After Benjamini-Hochberg, when compared among several segments. */
  adjustedP: number | null
  method: 'fisher' | 'z' | null
  n: number
  verdict: Verdict
  confounders: string[]
  /** Why the verdict is not stronger, in plain French. */
  reason: string | null
  /** A segment found among many: to verify on its own before acting. */
  exploratory: boolean
}

/** What differs between the two sides, or an explicit admission that it was not checked. */
export type Confounders = string[] | 'non évalués'

function rateFact(arm: Arm): RateFact {
  return { label: arm.label, successes: arm.successes, n: arm.n, rate: arm.n ? arm.successes / arm.n : 0, ci: wilson(arm.successes, arm.n) }
}

/** Newcombe (1998), method 10: interval of p1 − p2 from the two Wilson intervals. */
export function newcombeInterval(a: Counts, b: Counts): Interval {
  const p1 = a.n ? a.successes / a.n : 0
  const p2 = b.n ? b.successes / b.n : 0
  const w1 = wilson(a.successes, a.n)
  const w2 = wilson(b.successes, b.n)
  const d = p1 - p2
  return {
    low:  d - Math.sqrt((p1 - w1.low) ** 2 + (w2.high - p2) ** 2),
    high: d + Math.sqrt((w1.high - p1) ** 2 + (p2 - w2.low) ** 2),
  }
}

const fmtP = (p: number) => (p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ','))

function verdictFor(p: number, confounders: string[], evaluated: boolean): { verdict: Verdict; reason: string | null } {
  if (p >= TREND_ALPHA) return { verdict: 'insuffisant', reason: 'Écart non démontré par les données.' }
  if (p >= ALPHA) return { verdict: 'tendance', reason: `À surveiller, non démontré (p = ${fmtP(p)}).` }
  if (!evaluated) {
    return { verdict: 'tendance', reason: 'Écart net, mais les autres différences entre les deux côtés (boîte, période, ciblage) n’ont pas été vérifiées.' }
  }
  if (confounders.length > 0) {
    return { verdict: 'tendance', reason: `Écart net, mais d’autres différences peuvent l’expliquer : ${confounders.join(', ')}.` }
  }
  return { verdict: 'significatif', reason: null }
}

export interface CompareOptions {
  /** Required: what else differs (mailbox, period, targeting…), [] if checked and nothing, or 'non évalués'. */
  confounders: Confounders
  minSample?: number
}

/** One comparison of the same metric between two sides. */
export function compareRates(metric: string, a: Arm, b: Arm, opts: CompareOptions): Comparison {
  const evaluated = opts.confounders !== 'non évalués'
  const confounders = evaluated ? [...(opts.confounders as string[])] : []
  if (a.ageDays != null && b.ageDays != null) {
    const older = Math.max(a.ageDays, b.ageDays)
    if (older > 0 && Math.abs(a.ageDays - b.ageDays) / older > MAX_AGE_GAP) {
      confounders.push(`cohortes d’âges différents (J+${Math.round(a.ageDays)} et J+${Math.round(b.ageDays)})`)
    }
  }
  const base = {
    metric, a: rateFact(a), b: rateFact(b),
    delta: (a.n ? a.successes / a.n : 0) - (b.n ? b.successes / b.n : 0),
    deltaCi: newcombeInterval(a, b),
    n: a.n + b.n, confounders, adjustedP: null, exploratory: false,
  }
  const minSample = opts.minSample ?? MIN_SAMPLE
  if (a.n < minSample || b.n < minSample) {
    return {
      ...base, pValue: null, method: null, verdict: 'insuffisant',
      reason: `Pas assez de données : il faut au moins ${minSample} envois de chaque côté (${a.n} et ${b.n}).`,
    }
  }
  const test = compareProportions(a, b)
  return { ...base, pValue: test.pValue, method: test.method, ...verdictFor(test.pValue, confounders, evaluated) }
}

/**
 * Several segments against one reference (e.g. each job title against the
 * rest): p-values corrected together, so testing many segments does not
 * manufacture a winner. ONE family per report: pass every segment of every
 * dimension tested for the same answer in a single call, not one call per
 * dimension. Every result is marked exploratory.
 */
export function compareSegments(metric: string, segments: Array<{ arm: Arm; rest: Arm; confounders: Confounders }>, opts: Omit<CompareOptions, 'confounders'> = {}): Comparison[] {
  const raw = segments.map((s) => ({ ...compareRates(metric, s.arm, s.rest, { ...opts, confounders: s.confounders }), exploratory: true }))
  const tested = raw.map((c, i) => ({ c, i })).filter(({ c }) => c.pValue !== null)
  const adjusted = benjaminiHochberg(tested.map(({ c }) => c.pValue as number))
  return raw.map((c, i) => {
    const k = tested.findIndex((t) => t.i === i)
    if (k < 0) return c
    const adjustedP = adjusted[k]
    return { ...c, adjustedP, ...verdictFor(adjustedP, c.confounders, segments[i].confounders !== 'non évalués') }
  })
}
