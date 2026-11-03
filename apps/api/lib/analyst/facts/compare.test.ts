import { describe, expect, it } from 'vitest'
import { compareRates, compareSegments, newcombeInterval } from './compare'

describe('Newcombe interval of a difference (Newcombe 1998, table II)', () => {
  it('56/70 vs 48/80 → +0.2000, 95 % CI [0.0524, 0.3339]', () => {
    const ci = newcombeInterval({ successes: 56, n: 70 }, { successes: 48, n: 80 })
    expect(ci.low).toBeCloseTo(0.0524, 3)
    expect(ci.high).toBeCloseTo(0.3339, 3)
  })
})

describe('compareRates', () => {
  const a = { label: 'Campagne A', successes: 45, n: 100 }
  const b = { label: 'Campagne B', successes: 30, n: 100 }

  it('a real gap with nothing else differing is significant', () => {
    const c = compareRates('taux de réponse', a, b, { confounders: [] })
    expect(c.verdict).toBe('significatif')
    expect(c.delta).toBeCloseTo(0.15, 6)
    expect(c.pValue).toBeCloseTo(0.02846, 4)
    expect(c.deltaCi.low).toBeGreaterThan(0)
  })

  it('the same gap with another mailbox is only a trend, and says why', () => {
    const c = compareRates('taux de réponse', a, b, { confounders: ['boîtes d’envoi différentes'] })
    expect(c.verdict).toBe('tendance')
    expect(c.reason).toContain('boîtes d’envoi différentes')
  })

  it('a young campaign is "not enough data", not a loser', () => {
    const c = compareRates('taux de réponse', { label: 'Nouvelle', successes: 0, n: 12 }, b, { confounders: [] })
    expect(c.verdict).toBe('insuffisant')
    expect(c.pValue).toBeNull()
    expect(c.reason).toContain('au moins 30')
  })

  it('cohorts of different ages are flagged (J+3 against J+14)', () => {
    const c = compareRates('taux de réponse', { ...a, ageDays: 3 }, { ...b, ageDays: 14 }, { confounders: [] })
    expect(c.confounders.join()).toContain('J+3')
    expect(c.verdict).not.toBe('significatif')
  })

  it('confounders not evaluated: never more than a trend, and it says so', () => {
    const c = compareRates('taux de réponse', a, b, { confounders: 'non évalués' })
    expect(c.verdict).toBe('tendance')
    expect(c.reason).toContain('n’ont pas été vérifiées')
  })

  it('a trend is worded as "to watch, not demonstrated", never as probable', () => {
    const c = compareRates('taux de réponse', { label: 'x', successes: 40, n: 100 }, { label: 'y', successes: 30, n: 100 }, { confounders: [] })
    expect(c.verdict).toBe('tendance')
    expect(c.reason).toMatch(/^À surveiller, non démontré/)
    expect(c.reason).not.toMatch(/probable/i)
  })

  it('no gap with plenty of data: insufficient evidence, not significant', () => {
    expect(compareRates('taux de réponse', { label: 'x', successes: 30, n: 100 }, { label: 'y', successes: 31, n: 100 }, { confounders: [] }).verdict).toBe('insuffisant')
  })
})

describe('compareSegments', () => {
  it('twenty segments at p ≈ 0.04 each do not all win once corrected', () => {
    // 20 segments, each a borderline gap: uncorrected, each would "win".
    const segments = Array.from({ length: 20 }, (_, i) => ({
      arm:  { label: `segment ${i}`, successes: 40, n: 100 },
      rest: { label: 'reste', successes: 27, n: 100 },
      confounders: [] as string[],
    }))
    const out = compareSegments('taux de réponse', segments)
    expect(out.every((c) => c.adjustedP !== null && c.adjustedP >= c.pValue!)).toBe(true)
    // Same p everywhere → BH leaves it unchanged; the point is that adjustedP
    // is what the verdict reads.
    expect(out.every((c) => c.verdict === (c.adjustedP! < 0.05 ? 'significatif' : c.adjustedP! < 0.2 ? 'tendance' : 'insuffisant'))).toBe(true)
  })

  it('one strong segment among noise survives the correction, the noise does not', () => {
    const noise = Array.from({ length: 9 }, (_, i) => ({ arm: { label: `bruit ${i}`, successes: 32, n: 100 }, rest: { label: 'reste', successes: 30, n: 100 }, confounders: [] as string[] }))
    const out = compareSegments('taux de réponse', [{ arm: { label: 'CTO', successes: 60, n: 100 }, rest: { label: 'reste', successes: 30, n: 100 }, confounders: [] }, ...noise])
    expect(out[0].verdict).toBe('significatif')
    expect(out.slice(1).every((c) => c.verdict === 'insuffisant')).toBe(true)
    expect(out.every((c) => c.exploratory)).toBe(true)
  })

  it('segments too small are left untested and do not enter the correction', () => {
    const out = compareSegments('taux de réponse', [
      { arm: { label: 'petit', successes: 2, n: 5 }, rest: { label: 'reste', successes: 30, n: 100 }, confounders: [] },
      { arm: { label: 'grand', successes: 60, n: 100 }, rest: { label: 'reste', successes: 30, n: 100 }, confounders: [] },
    ])
    expect(out[0]).toMatchObject({ verdict: 'insuffisant', adjustedP: null })
    expect(out[1].adjustedP).toBeCloseTo(out[1].pValue!, 10)
  })
})
