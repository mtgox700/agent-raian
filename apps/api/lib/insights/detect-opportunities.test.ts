import { describe, expect, it } from 'vitest'
import { rate } from '@/lib/analyst/facts/campaign'
import { buildFacts } from '@/lib/analyst/evals/fixtures'
import { detectSegment, detectWinners, parseSegmentKey, segmentKey, type PendingBySegment } from './detect-opportunities'

const seg = (value: string, contacted: number, replied: number) => ({ value, unknown: false, leads: contacted, contacted, replied, replyRate: rate(replied, contacted) })
const noPending = (): PendingBySegment => ({ industry: new Map(), companySize: new Map(), country: new Map(), scoreBadge: new Map() })

function factsWith(industry: ReturnType<typeof seg>[]) {
  const f = buildFacts({ ageDays: 20, steps: [{ sent: 600, replies: 30 }] })
  return { ...f, targeting: { ...f.targeting, industry } }
}

describe('detectSegment', () => {
  const industry = [seg('banque', 300, 27), seg('retail', 300, 3)]

  it('a segment proven worse, with first messages waiting: one alert carrying the segment', () => {
    const pending = noPending()
    pending.industry.set('retail', 80)
    const a = detectSegment(factsWith(industry), pending)!
    expect(a).toMatchObject({ kind: 'segment_sous_performant', actions: ['skip_segment'] })
    expect(a.title).toContain('« Retail »')
    expect(parseSegmentKey(a.key)).toEqual({ campaignId: 'c', dimension: 'industry', value: 'retail' })
  })

  it('nothing when the gap is not proven, or when too few messages wait', () => {
    const pending = noPending()
    pending.industry.set('retail', 80)
    expect(detectSegment(factsWith([seg('banque', 40, 3), seg('retail', 40, 1)]), pending)).toBeNull()
    const few = noPending()
    few.industry.set('retail', 5)
    expect(detectSegment(factsWith(industry), few)).toBeNull()
  })

  it('the key survives any value', () => {
    const k = segmentKey('c1', 'industry', 'conseil : stratégie/RH')
    expect(parseSegmentKey(k)).toEqual({ campaignId: 'c1', dimension: 'industry', value: 'conseil : stratégie/RH' })
    expect(parseSegmentKey('segment_sous_performant:c1:email:x')).toBeNull()
  })
})

describe('detectWinners', () => {
  const pooled = rate(60, 2000)
  it('a clear winner on enough leads, said to be confirmed, not proven', () => {
    const [w] = detectWinners([{ campaignId: 'g', name: 'Gagnante', rate: rate(28, 400), verdict: 'tendance', direction: 'au-dessus' }], pooled)
    expect(w).toMatchObject({ kind: 'campagne_gagnante', severity: 'opportunite', actions: ['duplicate'], campaignId: 'g' })
    expect(w.evidence[1]).toContain('à confirmer')
  })

  it('not below 100 leads, not when only in the average', () => {
    expect(detectWinners([{ campaignId: 'g', name: 'G', rate: rate(10, 80), verdict: 'tendance', direction: 'au-dessus' }], pooled)).toEqual([])
    expect(detectWinners([{ campaignId: 'g', name: 'G', rate: rate(40, 400), verdict: 'insuffisant', direction: null }], pooled)).toEqual([])
  })
})
