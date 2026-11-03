import { describe, it, expect } from 'vitest'
import { aggregateTemplatePerformance, rankTemplates, bestTemplate } from './template-performance'
import { analyzeScoreCalibration } from './score-feedback'

describe('aggregateTemplatePerformance', () => {
  it('computes per-template reply/meeting rates', () => {
    const stats = aggregateTemplatePerformance([
      { templateId: 'a', replied: true, meeting: false },
      { templateId: 'a', replied: false, meeting: false },
      { templateId: 'a', replied: true, meeting: true },
      { templateId: 'b', replied: false, meeting: false },
    ])
    const a = stats.find((s) => s.templateId === 'a')!
    expect(a.sends).toBe(3)
    expect(a.replies).toBe(2)
    expect(a.replyRate).toBeCloseTo(2 / 3, 5)
    expect(a.meetingRate).toBeCloseTo(1 / 3, 5)
  })
})

describe('rankTemplates / bestTemplate', () => {
  const stats = [
    { templateId: 'low', sends: 50, replies: 5, meetings: 1, replyRate: 0.1, meetingRate: 0.02 },
    { templateId: 'high', sends: 50, replies: 15, meetings: 4, replyRate: 0.3, meetingRate: 0.08 },
    { templateId: 'tiny', sends: 2, replies: 2, meetings: 2, replyRate: 1, meetingRate: 1 },
  ]
  it('ranks by reply rate, ignoring under-sampled templates', () => {
    expect(rankTemplates(stats, 20).map((s) => s.templateId)).toEqual(['high', 'low'])
  })
  it('bestTemplate returns the top qualifying template', () => {
    expect(bestTemplate(stats, 20)).toBe('high')
  })
  it('returns null when nothing has enough signal', () => {
    expect(bestTemplate([stats[2]], 20)).toBeNull()
  })
})

describe('analyzeScoreCalibration', () => {
  it('reports monotonic when higher badges convert more', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => ({ badge: 'FAST_TRACK' as const, converted: true })),
      ...Array.from({ length: 10 }, (_, i) => ({ badge: 'NORMAL' as const, converted: i < 5 })),
      ...Array.from({ length: 10 }, (_, i) => ({ badge: 'NURTURE' as const, converted: i < 2 })),
    ]
    const r = analyzeScoreCalibration(rows)
    expect(r.monotonic).toBe(true)
    expect(r.issues).toHaveLength(0)
  })

  it('flags an inversion (lower badge out-converts a higher one)', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ badge: 'FAST_TRACK' as const, converted: i < 2 })), // 20%
      ...Array.from({ length: 10 }, (_, i) => ({ badge: 'NORMAL' as const, converted: i < 6 })),     // 60%
    ]
    const r = analyzeScoreCalibration(rows)
    expect(r.monotonic).toBe(false)
    expect(r.issues[0]).toContain('recalibrer')
  })
})
