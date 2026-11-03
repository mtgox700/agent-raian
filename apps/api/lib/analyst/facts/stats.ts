/**
 * The statistics the Analyst is allowed to use. Pure functions, no
 * dependency, each checked against values computed by hand or by R
 * (stats.test.ts). Okafor's rule: a rate is never shown without its
 * interval, and a difference never without its test.
 *
 *   wilson()        95 % interval of a proportion; right at 0 % and 100 %,
 *                   where the normal approximation is not.
 *   fisherExact()   two-sided exact test of a 2×2 table, for small counts.
 *   twoProportionZ() pooled z-test of two proportions, for large counts.
 *   benjaminiHochberg()  adjusted p-values when several segments are tested
 *                   at once: without it, one test in twenty "wins" by chance.
 */

export interface Interval { low: number; high: number }

/** Two-sided 95 % critical value of the normal distribution. */
export const Z_95 = 1.959963984540054

/** Wilson score interval of `successes / n`. [0, 1] when n is 0. */
export function wilson(successes: number, n: number, z = Z_95): Interval {
  if (!Number.isInteger(successes) || !Number.isInteger(n) || n < 0 || successes < 0 || successes > n) {
    throw new RangeError(`wilson: invalid counts ${successes}/${n}`)
  }
  if (n === 0) return { low: 0, high: 1 }
  const p = successes / n
  const z2 = z * z
  const denominator = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator
  // Exact at the edges: 0 successes cannot have a lower bound above 0.
  return {
    low:  successes === 0 ? 0 : Math.max(0, center - half),
    high: successes === n ? 1 : Math.min(1, center + half),
  }
}

// ─── Normal distribution ─────────────────────────────────────────────────────

/** Complementary error function (Numerical Recipes erfcc, |error| < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? r : 2 - r
}

/** Two-sided p-value of a standard normal statistic. */
export function twoSidedNormalP(z: number): number {
  return Math.min(1, erfc(Math.abs(z) / Math.SQRT2))
}

// ─── Tests of two proportions ────────────────────────────────────────────────

export interface Counts { successes: number; n: number }

export interface TestResult {
  method: 'fisher' | 'z'
  pValue: number
  statistic: number | null
}

/** Pooled two-proportion z-test. Null statistic when both rates are 0 % or 100 %. */
export function twoProportionZ(a: Counts, b: Counts): TestResult {
  const pooled = (a.successes + b.successes) / (a.n + b.n)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n))
  if (!Number.isFinite(se) || se === 0) return { method: 'z', pValue: 1, statistic: null }
  const z = (a.successes / a.n - b.successes / b.n) / se
  return { method: 'z', pValue: twoSidedNormalP(z), statistic: z }
}

const logFactorialCache: number[] = [0]
function logFactorial(n: number): number {
  for (let i = logFactorialCache.length; i <= n; i++) logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i)
  return logFactorialCache[n]
}

/**
 * Two-sided Fisher exact test of the table
 *     [ a.successes   a.n − a.successes ]
 *     [ b.successes   b.n − b.successes ]
 * p = sum of the probabilities of every table with the same margins that is
 * no more likely than the observed one (R's fisher.test convention, with the
 * same relative tolerance).
 */
export function fisherExact(a: Counts, b: Counts): TestResult {
  const r1 = a.n
  const r2 = b.n
  const c1 = a.successes + b.successes
  const total = r1 + r2
  const logP = (x: number) =>
    logFactorial(r1) + logFactorial(r2) + logFactorial(c1) + logFactorial(total - c1)
    - logFactorial(total) - logFactorial(x) - logFactorial(r1 - x) - logFactorial(c1 - x) - logFactorial(r2 - c1 + x)
  const lo = Math.max(0, c1 - r2)
  const hi = Math.min(r1, c1)
  const observed = logP(a.successes)
  const tolerance = 1 + 1e-7
  let p = 0
  for (let x = lo; x <= hi; x++) {
    const lp = logP(x)
    if (lp <= observed + Math.log(tolerance)) p += Math.exp(lp)
  }
  return { method: 'fisher', pValue: Math.min(1, p), statistic: null }
}

/**
 * Below this many events (successes or failures) in either cell, the normal
 * approximation is not trusted: the exact test is used.
 */
export const EXACT_TEST_BELOW = 30

/** The right test for the counts at hand. */
export function compareProportions(a: Counts, b: Counts): TestResult {
  const smallest = Math.min(a.successes, a.n - a.successes, b.successes, b.n - b.successes)
  return smallest < EXACT_TEST_BELOW ? fisherExact(a, b) : twoProportionZ(a, b)
}

/** Benjamini-Hochberg adjusted p-values, in the input order. */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length
  const order = pValues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p)
  const adjusted = new Array<number>(m)
  let running = 1
  for (let k = m - 1; k >= 0; k--) {
    running = Math.min(running, (order[k].p * m) / (k + 1))
    adjusted[order[k].i] = Math.min(1, running)
  }
  return adjusted
}

/** Median and 90th percentile (nearest-rank), null when empty. */
export function quantiles(values: number[]): { median: number; p90: number } | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((x, y) => x - y)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { median: at(0.5), p90: at(0.9) }
}

/** Events and censorings at one time (a day since first contact, say). */
export interface SurvivalCount { t: number; events: number; censored: number }

export interface SurvivalPoint {
  t: number
  /** Still at risk just before t. */
  atRisk: number
  events: number
  /** Share still without the event after t, with its 95 % interval. */
  survival: number
  ci: Interval
}

/**
 * Kaplan-Meier estimate of the share still without the event over time,
 * for observations cut short (a lead contacted 3 days ago who has not
 * replied yet is censored at 3 days, not counted as "never").
 * 95 % interval by the log-log transform with Greenwood's variance, which
 * stays inside [0, 1] (the default of R's survival::survfit is "log"; this
 * is conf.type = "log-log").
 */
export function kaplanMeier(counts: SurvivalCount[]): SurvivalPoint[] {
  const byT = new Map<number, { events: number; censored: number }>()
  for (const c of counts) {
    const e = byT.get(c.t) ?? { events: 0, censored: 0 }
    byT.set(c.t, { events: e.events + c.events, censored: e.censored + c.censored })
  }
  let atRisk = counts.reduce((a, c) => a + c.events + c.censored, 0)
  let s = 1
  let greenwood = 0
  const out: SurvivalPoint[] = []
  for (const t of [...byT.keys()].sort((a, b) => a - b)) {
    const { events, censored } = byT.get(t)!
    if (events > 0 && atRisk > 0) {
      s *= 1 - events / atRisk
      if (atRisk > events) greenwood += events / (atRisk * (atRisk - events))
      let ci: Interval = { low: s, high: s }
      if (s > 0 && s < 1 && greenwood > 0) {
        const se = Math.sqrt(greenwood) / Math.abs(Math.log(s))
        const ll = Math.log(-Math.log(s))
        // exp(-exp(ll ± z·se)): the + side gives the lower survival.
        ci = { low: Math.exp(-Math.exp(ll + Z_95 * se)), high: Math.exp(-Math.exp(ll - Z_95 * se)) }
      } else if (s === 0) {
        ci = { low: 0, high: 0 }
      }
      out.push({ t, atRisk, events, survival: s, ci })
    }
    atRisk -= events + censored
  }
  return out
}
