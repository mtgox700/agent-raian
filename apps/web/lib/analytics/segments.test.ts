import { describe, expect, it } from 'vitest'
import { buildBreakdown, buildMatrix, MAX_SEGMENTS } from './segments'
import type { SegmentRow } from './queries'

const row = (set: SegmentRow['set'], v: Partial<SegmentRow>, mature: number, replied: number): SegmentRow =>
  ({ set, title: null, industry: null, companySize: null, country: null, ...v, mature, replied })

describe('segments', () => {
  it('titles are grouped by level, empty titles kept apart', () => {
    const b = buildBreakdown([
      row('title', { title: 'ceo' }, 100, 12), row('title', { title: 'fondateur' }, 100, 8),
      row('title', { title: 'comptable' }, 300, 3), row('title', { title: '' }, 50, 1),
    ], 'seniority', true)
    expect(b.segments.map((s) => [s.value, s.rate.n, s.rate.successes])).toEqual([['executive', 200, 20], ['other', 300, 3]])
    expect(b.unknown).toMatchObject({ n: 50, successes: 1 })
    expect(b.measured).toBe(500)
    expect(b.title).toBe('Niveau de poste')
    expect(b.comparable).toBe(true)
  })

  it('labels keep the capitals typed by the user; a single value is not comparable', () => {
    const b = buildBreakdown([row('industry', { industry: 'saas', industryLabel: 'SaaS' }, 50, 2), row('industry', { industry: 'banque', industryLabel: 'banque' }, 50, 1)], 'industry', true)
    expect(b.segments.map((s) => s.label)).toEqual(['Banque', 'SaaS'])
    expect(buildBreakdown([row('country', { country: 'france' }, 80, 3)], 'country', true).comparable).toBe(false)
  })

  it('one campaign can prove a gap; several campaigns stay "à surveiller"', () => {
    const rows = [row('industry', { industry: 'banque' }, 400, 60), row('industry', { industry: 'retail' }, 400, 8)]
    const one = buildBreakdown(rows, 'industry', true)
    expect(one.segments[0]).toMatchObject({ value: 'banque', label: 'Banque', verdict: 'significatif', direction: 'au-dessus' })
    const many = buildBreakdown(rows, 'industry', false)
    expect(many.segments[0].verdict).toBe('tendance')
  })

  it('small segments are pooled under "Autres", never tested', () => {
    const rows = Array.from({ length: MAX_SEGMENTS + 3 }, (_, i) => row('country', { country: `p${i}` }, 100 - i, 2))
    const b = buildBreakdown(rows, 'country', true)
    expect(b.segments).toHaveLength(MAX_SEGMENTS + 1)
    expect(b.segments.at(-1)).toMatchObject({ pooled: true, verdict: null, label: 'Autres (3)' })
    expect(b.segments[0].label).toBe('P0')
  })

  it('sizes in their natural order, with readable labels', () => {
    const b = buildBreakdown([row('companySize', { companySize: 'L' }, 40, 1), row('companySize', { companySize: 'XS' }, 400, 9)], 'companySize', true)
    expect(b.segments.map((s) => s.label)).toEqual(['1 à 10', '201 à 1 000'])
  })

  it('matrix: levels × the largest industries, cells under 30 leads flagged', () => {
    const m = buildMatrix([
      row('titleIndustry', { title: 'drh', industry: 'banque' }, 40, 4),
      row('titleIndustry', { title: 'ceo', industry: 'banque' }, 10, 2),
      row('titleIndustry', { title: 'ceo', industry: 'retail' }, 35, 1),
      row('titleIndustry', { title: 'ceo', industry: null }, 99, 9),
    ])
    expect(m.columns.map((c) => c.label)).toEqual(['Banque', 'Retail'])
    expect(m.rows.map((r) => r.value)).toEqual(['executive', 'director'])
    expect(m.rows[0].cells.map((c) => [c.rate.n, c.enough])).toEqual([[10, false], [35, true]])
    expect(m.rows[0].total).toMatchObject({ n: 45, successes: 3 })
  })
})
