/**
 * Okafor's validation: every expected value below is computed by hand (shown)
 * or taken from R 4.x (`prop.test`, `fisher.test`, `p.adjust`), never from
 * the code under test.
 */
import { describe, expect, it } from 'vitest'
import {
  benjaminiHochberg, compareProportions, fisherExact, quantiles, twoProportionZ, twoSidedNormalP, wilson,
} from './stats'

describe('Wilson interval', () => {
  it('5/10: center 0.5, half-width 1.96·√(0.025 + 0.009604) / 1.38416 = 0.2634', () => {
    const { low, high } = wilson(5, 10)
    expect(low).toBeCloseTo(0.2366, 4)
    expect(high).toBeCloseTo(0.7634, 4)
  })

  it('0/10 is not [0, 0]: the interval reaches 27.8 % (3.8416 / 13.8416)', () => {
    const { low, high } = wilson(0, 10)
    expect(low).toBe(0)
    expect(high).toBeCloseTo(0.2775, 4)
  })

  it('10/10 mirrors 0/10', () => {
    const { low, high } = wilson(10, 10)
    expect(low).toBeCloseTo(0.7225, 4)
    expect(high).toBe(1)
  })

  it('no data: the whole range', () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 })
  })

  it('refuses impossible counts', () => {
    expect(() => wilson(11, 10)).toThrow(RangeError)
    expect(() => wilson(-1, 10)).toThrow(RangeError)
    expect(() => wilson(1.5, 10)).toThrow(RangeError)
  })
})

describe('normal p-value', () => {
  it('z = 1.96 → 0.05, z = 0 → 1, z = 3.29 → 0.001', () => {
    expect(twoSidedNormalP(1.959964)).toBeCloseTo(0.05, 5)
    expect(twoSidedNormalP(0)).toBeCloseTo(1, 6)
    expect(twoSidedNormalP(-3.290527)).toBeCloseTo(0.001, 5)
  })
})

describe('two-proportion z-test', () => {
  it('45/100 vs 30/100: pooled 0.375, se 0.068465, z 2.1909, p 0.02846', () => {
    const r = twoProportionZ({ successes: 45, n: 100 }, { successes: 30, n: 100 })
    expect(r.statistic).toBeCloseTo(2.1909, 3)
    expect(r.pValue).toBeCloseTo(0.02846, 4)
  })

  it('both at 0 %: no evidence of a difference', () => {
    expect(twoProportionZ({ successes: 0, n: 50 }, { successes: 0, n: 80 })).toMatchObject({ pValue: 1, statistic: null })
  })
})

describe('Fisher exact test (R fisher.test, two-sided)', () => {
  it('lady tasting tea [[3,1],[1,3]] → 0.4857', () => {
    expect(fisherExact({ successes: 3, n: 4 }, { successes: 1, n: 4 }).pValue).toBeCloseTo(0.4857, 4)
  })

  it('[[1,9],[11,3]] → 0.002759', () => {
    expect(fisherExact({ successes: 1, n: 10 }, { successes: 11, n: 14 }).pValue).toBeCloseTo(0.002759, 5)
  })

  it('identical tables → 1', () => {
    expect(fisherExact({ successes: 2, n: 10 }, { successes: 2, n: 10 }).pValue).toBeCloseTo(1, 6)
  })
})

describe('test selection', () => {
  it('exact test under 30 events in a cell, z-test above', () => {
    expect(compareProportions({ successes: 3, n: 40 }, { successes: 9, n: 40 }).method).toBe('fisher')
    expect(compareProportions({ successes: 45, n: 100 }, { successes: 30, n: 100 }).method).toBe('z')
  })
})

describe('Benjamini–Hochberg (R p.adjust "BH")', () => {
  it('[0.01, 0.04, 0.03, 0.005] → [0.02, 0.04, 0.04, 0.02]', () => {
    const adjusted = benjaminiHochberg([0.01, 0.04, 0.03, 0.005])
    expect(adjusted.map((p) => Number(p.toFixed(6)))).toEqual([0.02, 0.04, 0.04, 0.02])
  })

  it('never above 1, empty stays empty', () => {
    expect(benjaminiHochberg([0.9, 0.95])).toEqual([0.95, 0.95])
    expect(benjaminiHochberg([])).toEqual([])
  })
})

describe('quantiles (nearest rank)', () => {
  it('median and P90 of 1..10 → 5 and 9', () => {
    expect(quantiles([10, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({ median: 5, p90: 9 })
  })

  it('nothing to measure → null', () => {
    expect(quantiles([])).toBeNull()
  })
})

describe('kaplanMeier', () => {
  it('matches the textbook estimate with censoring (6 subjects)', async () => {
    const { kaplanMeier } = await import('./stats')
    // times: 1, 2+, 3, 3, 4+, 5 (+ = censored)
    const km = kaplanMeier([
      { t: 1, events: 1, censored: 0 }, { t: 2, events: 0, censored: 1 }, { t: 3, events: 2, censored: 0 },
      { t: 4, events: 0, censored: 1 }, { t: 5, events: 1, censored: 0 },
    ])
    expect(km.map((p) => p.t)).toEqual([1, 3, 5])
    expect(km.map((p) => p.atRisk)).toEqual([6, 4, 1])
    expect(km[0].survival).toBeCloseTo(5 / 6, 10)
    expect(km[1].survival).toBeCloseTo((5 / 6) * (2 / 4), 10)
    expect(km[2].survival).toBe(0)
  })

  it('log-log interval: inside [0, 1], around the estimate, Greenwood by hand', async () => {
    const { kaplanMeier, Z_95 } = await import('./stats')
    const [p] = kaplanMeier([{ t: 2, events: 10, censored: 0 }, { t: 9, events: 0, censored: 90 }])
    expect(p.survival).toBeCloseTo(0.9, 10)
    const v = 10 / (100 * 90)
    const se = Math.sqrt(v) / Math.abs(Math.log(0.9))
    const ll = Math.log(-Math.log(0.9))
    expect(p.ci.low).toBeCloseTo(Math.exp(-Math.exp(ll + Z_95 * se)), 10)
    expect(p.ci.high).toBeCloseTo(Math.exp(-Math.exp(ll - Z_95 * se)), 10)
    expect(p.ci.low).toBeLessThan(0.9)
    expect(p.ci.high).toBeGreaterThan(0.9)
    expect(p.ci.high).toBeLessThanOrEqual(1)
  })

  it('no event, no step', async () => {
    const { kaplanMeier } = await import('./stats')
    expect(kaplanMeier([{ t: 3, events: 0, censored: 40 }])).toEqual([])
  })
})
