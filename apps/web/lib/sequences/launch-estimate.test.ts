import { describe, expect, it } from 'vitest'
import { computeEstimate } from './launch-estimate'

describe('computeEstimate', () => {
  it('everything goes out today when the cap allows it', () => {
    expect(computeEstimate(40, 50, 0, 30)).toEqual({ today: 40, days: 1, minutesToday: 20 })
  })

  it('1000 emails with a 500 cap: 500 today, the rest tomorrow', () => {
    expect(computeEstimate(1000, 500, 0, 32.5)).toEqual({ today: 500, days: 2, minutesToday: 271 })
  })

  it('takes into account what the mailbox already sent in the last 24h', () => {
    expect(computeEstimate(100, 50, 45, 30)).toEqual({ today: 5, days: 3, minutesToday: 3 })
  })

  it('a mailbox at its cap sends nothing more today', () => {
    expect(computeEstimate(10, 50, 60, 30)).toEqual({ today: 0, days: 2, minutesToday: 0 })
  })
})
