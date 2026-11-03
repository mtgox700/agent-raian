import { describe, expect, it } from 'vitest'
import { buildCalibration, buildChannels, buildCohorts, buildDelay, buildHeatmap, buildKpis, buildLeaderboard, buildMailboxes, buildMix, buildSteps } from './build'
import { filtersQuery, parseFilters } from './filters'
import type { CohortRow } from './queries'

const row = (campaignId: string, day: string, contacted: number, mature: number, replied: number, positive = 0): CohortRow => ({ campaignId, day, contacted, mature, replied, positive })
const from = new Date('2026-10-01T00:00:00Z')

describe('filters', () => {
  it('falls back to 30 days and keeps only visible campaigns', () => {
    const f = parseFilters({ p: '365d', c: 'mine,foreign,mine' }, ['mine'], new Date('2026-10-18T00:00:00Z'))
    expect(f).toMatchObject({ period: '30d', days: 30, campaignIds: ['mine'] })
    expect(f.from.toISOString()).toBe('2026-09-18T00:00:00.000Z')
    expect(filtersQuery('30d', [])).toBe('')
    expect(filtersQuery('7d', ['a', 'b'])).toBe('?p=7d&c=a%2Cb')
    expect(filtersQuery('30d', ['a'], ['b'])).toBe('?c=a&vs=b')
    // The other side: visible only, never a campaign already in the selection.
    expect(parseFilters({ c: 'a', vs: 'a,b,foreign' }, ['a', 'b']).versusIds).toEqual(['b'])
  })
})

describe('kpis', () => {
  it('counts the J+7 reply on mature leads only, and tells how many are still too young', () => {
    const kpis = buildKpis([row('a', '2026-10-02', 100, 80, 8), row('a', '2026-09-20', 100, 100, 5)], from, [], new Date('2026-09-01T00:00:00Z'))
    const reply = kpis.find((k) => k.key === 'reply')!
    expect(reply.rate).toMatchObject({ successes: 8, n: 80 })
    expect(reply.previous).toMatchObject({ successes: 5, n: 100 })
    expect(reply.note).toContain('20 leads')
    expect(['significatif', 'tendance', 'insuffisant']).toContain(reply.trend?.verdict)
  })

  it('no arrow on small samples: a change is insufficient below 30 leads', () => {
    const kpis = buildKpis([row('a', '2026-10-02', 10, 10, 3), row('a', '2026-09-20', 10, 10, 0)], from, [], new Date('2026-09-01T00:00:00Z'))
    expect(kpis.find((k) => k.key === 'reply')?.trend?.verdict).toBe('insuffisant')
  })
})

describe('cohorts', () => {
  it('groups days into Paris weeks and flags weeks still maturing', () => {
    const points = buildCohorts([row('a', '2026-10-05', 10, 10, 1), row('a', '2026-10-07', 10, 4, 0), row('a', '2026-09-28', 5, 5, 1)])
    expect(points.map((p) => p.week)).toEqual(['2026-09-28', '2026-10-05'])
    expect(points[1]).toMatchObject({ contacted: 20, mature: 14, provisional: true })
    expect(points[0].provisional).toBe(false)
  })
})

describe('leaderboard', () => {
  it('ranks by the lower bound: a small lucky campaign does not top a large steady one', () => {
    const rows = [row('big', '2026-10-02', 500, 500, 40), row('small', '2026-10-02', 31, 31, 4), row('tiny', '2026-10-02', 12, 12, 6)]
    const { ranked, insufficient, pooled } = buildLeaderboard(rows, from, new Map([['big', 'Grande'], ['small', 'Petite'], ['tiny', 'Minuscule']]))
    expect(ranked.map((r) => r.campaignId)).toEqual(['big', 'small'])
    expect(insufficient.map((r) => r.campaignId)).toEqual(['tiny'])
    expect(pooled).toMatchObject({ successes: 50, n: 543 })
  })
})

describe('steps', () => {
  it('a step nobody reached yet is pending, not a loss', () => {
    const steps = buildSteps([
      { position: 1, channel: 'EMAIL', reached: 100, bounced: 2, replied: 5, positive: 2 },
      { position: 2, channel: 'EMAIL', reached: 70, bounced: 0, replied: 3, positive: 1 },
      { position: 3, channel: 'LINKEDIN', reached: 0, bounced: 0, replied: 0, positive: 0 },
    ])
    expect(steps.map((s) => s.dropped)).toEqual([30, null, null])
    expect(steps[2].pending).toBe(true)
    expect(steps[0].replyRate).toMatchObject({ successes: 5, n: 100 })
  })
})

describe('mailboxes', () => {
  it('flags the 2 % watch zone and the 5 % danger, and not below 50 attempts', () => {
    const health = buildMailboxes([
      { mailboxId: 'hot', week: '2026-10-05', sent: 180, bounced: 20, failed: 0 },
      { mailboxId: 'warm', week: '2026-10-05', sent: 194, bounced: 6, failed: 0 },
      { mailboxId: 'new', week: '2026-10-05', sent: 20, bounced: 3, failed: 0 },
    ], from, new Map([['hot', { label: 'a@x.fr', status: 'CONNECTED' }]]))
    expect(Object.fromEntries(health.map((h) => [h.mailboxId, h.level]))).toEqual({ hot: 'danger', warm: 'vigilance', new: 'insuffisant' })
    expect(health.find((h) => h.mailboxId === 'warm')?.label).toBe('Boîte supprimée')
  })
})

describe('A2', () => {
  it('delay: cumulative reply share with censoring, enough only from 20 replies', () => {
    const d = buildDelay([{ day: 1, events: 10, censored: 0 }, { day: 5, events: 10, censored: 0 }, { day: 9, events: 0, censored: 80 }])
    expect(d).toMatchObject({ events: 20, leads: 100, enough: true })
    expect(d.points.at(-1)?.replied).toBeCloseTo(0.2, 10)
    expect(d.marks.find((m) => m.day === 3)?.share).toBeCloseTo(0.5, 10)
    expect(buildDelay([{ day: 1, events: 3, censored: 50 }]).enough).toBe(false)
  })

  it('calibration: the badges in order, Fast Track tested against Normal, coverage of the score', () => {
    const c = buildCalibration([{ badge: 'NORMAL', mature: 400, replied: 12 }, { badge: 'FAST_TRACK', mature: 400, replied: 40 }, { badge: 'UNSCORED', mature: 200, replied: 2 }])
    expect(c.badges.map((b) => b.badge)).toEqual(['FAST_TRACK', 'NORMAL', 'UNSCORED'])
    // Populations not compared (different campaigns): capped at 'tendance' by the engine, on purpose.
    expect(c.topVsNormal?.verdict).toBe('tendance')
    expect(c.topVsNormal!.delta).toBeCloseTo(0.07, 10)
    expect(c.coverage).toMatchObject({ successes: 800, n: 1000 })
  })

  it('mix, heatmap and channels', () => {
    const mix = buildMix([{ week: '2026-10-05', classification: 'POSITIVE', leads: 3 }, { week: '2026-10-05', classification: 'NEGATIVE', leads: 1 }, { week: '2026-10-05', classification: 'NEUTRAL', leads: 1 }])
    expect(mix[0]).toMatchObject({ total: 5, positive: 3, negative: 1, neutral: 1 })
    const h = buildHeatmap([{ dow: 1, hour: 9, sent: 10, replied: 2 }, { dow: 8, hour: 9, sent: 99, replied: 9 }])
    expect(h.sent[0][9]).toBe(10)
    expect(h.totalSent).toBe(10)
    const ch = buildChannels([{ channel: 'EMAIL', reached: 100, replied: 5 }, { channel: 'SMS', reached: 20, replied: 0 }, { channel: 'LINKEDIN', reached: 0, replied: 0 }])
    expect(ch.map((c) => c.channel)).toEqual(['EMAIL', 'SMS'])
    expect(ch[1].rate).toBeNull()
  })
})
