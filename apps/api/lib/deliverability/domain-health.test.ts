import { describe, it, expect } from 'vitest'
import { computeDomainHealth } from './domain-health'

describe('computeDomainHealth', () => {
  it('is healthy with full auth + clean metrics', () => {
    const h = computeDomainHealth({
      spfOk: true, dkimOk: true, dmarcOk: true,
      spamRate: 0.0004, bounceRate: 0.005, reputation: 'high',
      sentToday: 20, dailyCap: 40,
    })
    expect(h.score).toBe(100)
    expect(h.status).toBe('healthy')
    expect(h.recommendations).toHaveLength(0)
  })

  it('penalizes missing authentication', () => {
    const h = computeDomainHealth({ spfOk: false, dkimOk: false, dmarcOk: true })
    expect(h.score).toBe(60) // -20 -20
    expect(h.recommendations.some((r) => r.includes('SPF'))).toBe(true)
    expect(h.recommendations.some((r) => r.includes('DKIM'))).toBe(true)
  })

  it('goes critical on high spam + bad reputation', () => {
    const h = computeDomainHealth({ spamRate: 0.004, reputation: 'bad' })
    expect(h.status).toBe('critical')
    expect(h.score).toBeLessThan(50)
  })

  it('flags over-cap volume', () => {
    const h = computeDomainHealth({ sentToday: 60, dailyCap: 40 })
    expect(h.factors.some((f) => f.label.includes('Cap'))).toBe(true)
    expect(h.recommendations.some((r) => r.includes('rotation'))).toBe(true)
  })

  it('does not penalize unknown fields (scores on evidence)', () => {
    const h = computeDomainHealth({})
    expect(h.score).toBe(100)
    expect(h.status).toBe('healthy')
  })

  it('clamps to [0,100]', () => {
    const h = computeDomainHealth({
      spfOk: false, dkimOk: false, dmarcOk: false,
      spamRate: 0.004, bounceRate: 0.03, reputation: 'bad', sentToday: 100, dailyCap: 10,
    })
    expect(h.score).toBe(0)
    expect(h.status).toBe('critical')
  })

  it('at_risk in the mid band', () => {
    const h = computeDomainHealth({ spamRate: 0.001, bounceRate: 0.015, reputation: 'medium' })
    // -15 -10 -10 = 65
    expect(h.status).toBe('at_risk')
    expect(h.score).toBe(65)
  })
})
