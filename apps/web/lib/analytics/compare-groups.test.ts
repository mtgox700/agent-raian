import { describe, expect, it } from 'vitest'
import { rate } from '@/lib/analyst/facts/campaign'
import { buildGroupComparison, differences, targetingSignature, type GroupProfile } from './compare-groups'
import type { Kpi } from './build'

const kpis = (replied: number, n: number): Kpi[] => [
  { key: 'contacted', label: 'Leads contactés', value: n },
  { key: 'reply', label: 'Réponse à J+7', rate: rate(replied, n) },
  { key: 'positive', label: 'Réponse positive à J+7', rate: rate(Math.round(replied / 2), n) },
  { key: 'bounce', label: 'Rebonds', rate: rate(4, 400) },
]
const profile = (label: string, over: Partial<GroupProfile> = {}): GroupProfile =>
  ({ label, campaigns: 1, mailboxes: ['box1'], targeting: ['t'], ageDays: 20, ...over })

describe('comparison mode', () => {
  it('nothing differs besides the message: a clear gap is proven', () => {
    const c = buildGroupComparison(kpis(60, 400), kpis(12, 400), profile('A'), profile('B'))
    expect(c.differences).toEqual([])
    expect(c.measures.find((m) => m.key === 'reply')?.comparison.verdict).toBe('significatif')
  })

  it('another mailbox or targeting: the same gap stays to watch, and says why', () => {
    const c = buildGroupComparison(kpis(60, 400), kpis(12, 400), profile('A'), profile('B', { mailboxes: ['box2'], targeting: ['u'] }))
    expect(c.differences).toEqual(['boîtes d’envoi différentes', 'ciblages différents'])
    expect(c.measures.find((m) => m.key === 'reply')?.comparison.verdict).toBe('tendance')
  })

  it('cohorts of very different ages are a difference too (facts engine)', () => {
    const c = buildGroupComparison(kpis(60, 400), kpis(12, 400), profile('A', { ageDays: 40 }), profile('B', { ageDays: 9 }))
    expect(c.differences.some((d) => d.startsWith('cohortes d’âges différents'))).toBe(true)
  })

  it('targeting is compared without case, order or duplicates', () => {
    const t1 = targetingSignature({ targetIndustry: 'SaaS ', targetTitles: ['CTO', 'cto', 'DSI'], targetCompanySizes: ['S'], targetGeos: [] })
    const t2 = targetingSignature({ targetIndustry: 'saas', targetTitles: ['dsi', 'Cto'], targetCompanySizes: ['S'], targetGeos: [] })
    expect(t1).toBe(t2)
    expect(differences(profile('A', { targeting: [t1] }), profile('B', { targeting: [t2] }))).toEqual([])
  })
})
