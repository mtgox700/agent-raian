import { describe, expect, it, vi } from 'vitest'
import { compare, countByDay, dayKey, lastDayKeys, startOfDayIn, summarizePeriod } from './dashboard-metrics'

const from = new Date('2026-10-01T00:00:00Z')
const to   = new Date('2026-10-31T00:00:00Z')
const at   = new Date('2026-10-09T10:00:00Z')

describe('summarizePeriod', () => {
  it('ignores queued and failed rows: 400 queued emails are not 400 sent emails', () => {
    const sends = [
      ...Array.from({ length: 400 }, (_, i) => ({ status: 'PENDING', sentAt: null, leadId: `q${i}` })),
      { status: 'FAILED', sentAt: at, leadId: 'f' },
      { status: 'SENT',    sentAt: at, leadId: 'a' },
      { status: 'OPENED',  sentAt: at, leadId: 'b' },
      { status: 'CLICKED', sentAt: at, leadId: 'b' },
      { status: 'BOUNCED', sentAt: at, leadId: 'c' },
    ]
    const s = summarizePeriod(sends, [{ leadId: 'b', receivedAt: at }, { leadId: 'b', receivedAt: at }], from, to)
    expect(s.sent).toBe(4)
    expect(s.bounced).toBe(1)
    expect(s.deliveryRate).toBe(75)
    expect(s.openRate).toBeCloseTo(66.7)
    expect(s.leadsReached).toBe(3)
    expect(s.replyRate).toBeCloseTo(33.3) // one lead replied twice
  })

  it('returns null rates when nothing was sent', () => {
    const s = summarizePeriod([], [], from, to)
    expect(s.deliveryRate).toBeNull()
    expect(s.openRate).toBeNull()
    expect(s.replyRate).toBeNull()
  })

  it('keeps rows outside the period out', () => {
    const s = summarizePeriod([{ status: 'SENT', sentAt: new Date('2026-09-01T00:00:00Z'), leadId: 'x' }], [], from, to)
    expect(s.sent).toBe(0)
  })
})

describe('summarizePeriod: one channel, one window', () => {
  it('counts only emails as emails: a WhatsApp message is a message, not an email', () => {
    const sends = [
      { status: 'SENT',    sentAt: at, leadId: 'a', channel: 'EMAIL' },
      { status: 'OPENED',  sentAt: at, leadId: 'b', channel: 'EMAIL' },
      { status: 'BOUNCED', sentAt: at, leadId: 'c', channel: 'EMAIL' },
      { status: 'SENT',    sentAt: at, leadId: 'd', channel: 'WHATSAPP' },
    ]
    const s = summarizePeriod(sends, [], from, to)
    expect(s.messages).toBe(4)
    expect(s.sent).toBe(3)
    expect(s.delivered).toBe(2)
    expect(s.opened).toBe(1)
    expect(s.openRate).toBe(50)
    expect(s.leadsReached).toBe(4)
  })

  it('counts an email opened by its open time, not only by its last status', () => {
    const s = summarizePeriod([{ status: 'SENT', sentAt: at, openedAt: at, leadId: 'a', channel: 'EMAIL' }], [], from, to)
    expect(s.opened).toBe(1)
  })

  it('never goes above 100 %: a reply from a lead not contacted in the period is not counted', () => {
    const sends = [{ status: 'SENT', sentAt: at, leadId: 'a', channel: 'EMAIL' }]
    const replies = [{ leadId: 'a', receivedAt: at }, { leadId: 'old', receivedAt: at }, { leadId: 'older', receivedAt: at }]
    const s = summarizePeriod(sends, replies, from, to)
    expect(s.leadsReplied).toBe(1)
    expect(s.replyRate).toBe(100)
  })
})

describe('compare', () => {
  it('has no previous value when the previous period is empty', () => {
    expect(compare(22, 0)).toEqual({ previousValue: null, trend: 'flat' })
    expect(compare(null, 4)).toEqual({ previousValue: null, trend: 'flat' })
  })

  it('reports the direction of a real change', () => {
    expect(compare(10, 5)).toEqual({ previousValue: 5, trend: 'up' })
    expect(compare(3, 5)).toEqual({ previousValue: 5, trend: 'down' })
  })
})

describe('Paris days', () => {
  it('starts the day at Paris midnight, summer and winter', () => {
    expect(startOfDayIn(new Date('2026-10-09T15:00:00Z')).toISOString()).toBe('2026-10-08T22:00:00.000Z')
    expect(startOfDayIn(new Date('2026-12-09T15:00:00Z')).toISOString()).toBe('2026-12-08T23:00:00.000Z')
  })

  it('puts a 23:30 UTC email on the next Paris day', () => {
    expect(dayKey(new Date('2026-10-09T23:30:00Z'))).toBe('2026-10-10')
    expect(countByDay([new Date('2026-10-09T23:30:00Z')]).get('2026-10-10')).toBe(1)
  })

  it('lists consecutive days across the daylight-saving change', () => {
    const keys = lastDayKeys(new Date('2026-10-27T08:00:00Z'), 4)
    expect(keys).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
  })
})

describe('countByDay cost', () => {
  it('reuses one formatter per time zone: the home page formats one date per email', () => {
    const Real = Intl.DateTimeFormat
    let built = 0
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) { built++; return new Real(...args) } as unknown as typeof Intl.DateTimeFormat)
    try {
      const dates = Array.from({ length: 1000 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 3_600_000))
      const counts = countByDay(dates, 'America/New_York')
      expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(1000)
      expect(built).toBeLessThanOrEqual(1)
    } finally {
      spy.mockRestore()
    }
  })
})
