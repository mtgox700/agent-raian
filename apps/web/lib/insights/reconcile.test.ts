import { describe, expect, it } from 'vitest'
import { reconcile, type InsightRecord } from './reconcile'
import type { DetectedInsight } from './detect'

const NOW = new Date('2026-10-19T09:00:00Z')
const found = (key: string, campaignId: string | null = 'c1', notify = true): DetectedInsight =>
  ({ key, kind: 'file_bloquee', severity: 'bloquant', campaignId, title: 't', evidence: [], next: 'n', notify })
const rec = (key: string, status: InsightRecord['status'], over: Partial<InsightRecord> = {}): InsightRecord =>
  ({ id: `id-${key}`, key, campaignId: 'c1', status, snoozedUntil: null, ...over })
const ops = (xs: ReturnType<typeof reconcile>) => xs.map((o) => `${o.op}:${'id' in o ? o.id : o.insight.key}${'notify' in o ? `:${o.notify}` : ''}`)

describe('reconcile', () => {
  it('a new cause opens and notifies; seen again it is refreshed, silently', () => {
    expect(ops(reconcile([], [found('a')], new Set(), NOW))).toEqual(['open:a:true'])
    expect(ops(reconcile([rec('a', 'OPEN')], [found('a')], new Set(), NOW))).toEqual(['refresh:id-a'])
  })

  it('a cause that comes back reopens and notifies; a cause gone is resolved', () => {
    expect(ops(reconcile([rec('a', 'RESOLVED')], [found('a')], new Set(), NOW))).toEqual(['reopen:id-a:true'])
    expect(ops(reconcile([rec('a', 'OPEN'), rec('b', 'SNOOZED')], [], new Set(), NOW))).toEqual(['resolve:id-a', 'resolve:id-b'])
  })

  it('a snoozed alert stays quiet until its snooze ends', () => {
    const later = new Date(NOW.getTime() + 3_600_000)
    const earlier = new Date(NOW.getTime() - 3_600_000)
    expect(ops(reconcile([rec('a', 'SNOOZED', { snoozedUntil: later })], [found('a')], new Set(), NOW))).toEqual(['refresh:id-a'])
    expect(ops(reconcile([rec('a', 'SNOOZED', { snoozedUntil: earlier })], [found('a')], new Set(), NOW))).toEqual(['reopen:id-a:true'])
  })

  it('a campaign that could not be read keeps its alerts', () => {
    expect(ops(reconcile([rec('a', 'OPEN', { campaignId: 'c1' }), rec('q', 'OPEN', { campaignId: null })], [], new Set(['c1']), NOW))).toEqual(['resolve:id-q'])
  })

  it('a cause another part of the app notifies opens without a notification', () => {
    expect(ops(reconcile([], [found('p', 'c1', false)], new Set(), NOW))).toEqual(['open:p:false'])
  })
})
