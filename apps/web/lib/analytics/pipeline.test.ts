import { describe, expect, it } from 'vitest'
import { buildPipeline, buildTriangle } from './pipeline'

describe('triangle', () => {
  it('a cell is complete, partly observed, or not shown yet', () => {
    const t = buildTriangle([
      { week: '2026-09-07', contacted: 100, mature: [100, 100, 100, 100], replied: [4, 6, 8, 9] },
      { week: '2026-10-05', contacted: 50, mature: [50, 20, 0, 0], replied: [1, 1, 0, 0] },
    ])
    expect(t.weeks[1].cells.map((c) => c.state)).toEqual(['complete', 'partial', 'pending', 'pending'])
    expect(t.weeks[1].cells[1].rate).toMatchObject({ successes: 1, n: 20 })
    // The reference pools complete weeks only: the young week's partial J+7 is left out.
    expect(t.reference[1]).toMatchObject({ successes: 6, n: 100 })
    expect(t.reference[0]).toMatchObject({ successes: 5, n: 150 })
  })
})

describe('pipeline', () => {
  it('each stage as a share of the contacted leads, medians only from 20 leads', () => {
    const p = buildPipeline({ contacted: 400, replied: 40, interested: 12, meeting: 3, won: 1, daysToReply: 2.34, daysToInterest: 3.1, daysToWon: 20 })
    expect(p.map((s) => s.count)).toEqual([400, 40, 12, 3, 1])
    expect(p[1].ofContacted).toMatchObject({ successes: 40, n: 400 })
    expect(p[1].medianDays).toBe(2.3)
    expect(p[2].medianDays).toBeNull()
    expect(p[4].note).toContain('à la main')
  })

  it('nothing contacted, nothing shown', () => {
    expect(buildPipeline(null)).toEqual([])
    expect(buildPipeline({ contacted: 0, replied: 0, interested: 0, meeting: 0, won: 0, daysToReply: null, daysToInterest: null, daysToWon: null })).toEqual([])
  })
})
