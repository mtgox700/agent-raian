import { describe, it, expect } from 'vitest'
import {
  rampLimit,
  remainingCapacity,
  canSend,
  jitterDelayMs,
  lintContent,
  DEFAULT_DAILY_CAP,
  MAX_DAILY_CAP,
} from './send-policy'

describe('rampLimit', () => {
  it('returns 0 for negative age', () => {
    expect(rampLimit(-1)).toBe(0)
  })
  it('caps week 1 at 5', () => {
    expect(rampLimit(0)).toBe(5)
    expect(rampLimit(6)).toBe(5)
  })
  it('caps week 2 at 10', () => {
    expect(rampLimit(7)).toBe(10)
    expect(rampLimit(13)).toBe(10)
  })
  it('caps week 3 at 20', () => {
    expect(rampLimit(14)).toBe(20)
    expect(rampLimit(20)).toBe(20)
  })
  it('reaches full cap at week 4+', () => {
    expect(rampLimit(21)).toBe(DEFAULT_DAILY_CAP)
    expect(rampLimit(365)).toBe(DEFAULT_DAILY_CAP)
  })
  it('never exceeds MAX_DAILY_CAP even with a high configured cap', () => {
    expect(rampLimit(100, 999)).toBe(MAX_DAILY_CAP)
  })
  it('respects a lower configured dailyCap', () => {
    expect(rampLimit(100, 30)).toBe(30)
    // ramp value (5) is below the configured cap, so ramp wins early
    expect(rampLimit(2, 30)).toBe(5)
  })
})

describe('remainingCapacity', () => {
  it('subtracts today’s sends from the ramp limit', () => {
    expect(remainingCapacity({ mailboxAgeDays: 30, sentToday: 10 })).toBe(DEFAULT_DAILY_CAP - 10)
  })
  it('never goes negative', () => {
    expect(remainingCapacity({ mailboxAgeDays: 30, sentToday: 999 })).toBe(0)
  })
  it('treats negative sentToday as 0', () => {
    expect(remainingCapacity({ mailboxAgeDays: 30, sentToday: -5 })).toBe(DEFAULT_DAILY_CAP)
  })
})

describe('canSend', () => {
  it('blocks a brand-new mailbox? no — week1 allows 5', () => {
    expect(canSend({ mailboxAgeDays: 0, sentToday: 0 })).toEqual({ allowed: true, reason: 'OK', remaining: 5 })
  })
  it('blocks when the daily cap is reached', () => {
    expect(canSend({ mailboxAgeDays: 30, sentToday: DEFAULT_DAILY_CAP })).toEqual({
      allowed: false, reason: 'CAP_REACHED', remaining: 0,
    })
  })
  it('flags a mailbox too new to send at all (negative age)', () => {
    expect(canSend({ mailboxAgeDays: -1, sentToday: 0 })).toEqual({
      allowed: false, reason: 'MAILBOX_TOO_NEW', remaining: 0,
    })
  })
})

describe('jitterDelayMs', () => {
  it('is deterministic with an injected rng', () => {
    expect(jitterDelayMs(1000, 500, () => 0)).toBe(1000)
    expect(jitterDelayMs(1000, 500, () => 0.5)).toBe(1250)
    expect(jitterDelayMs(1000, 500, () => 0.999)).toBe(1500) // exclusive upper, rounds to 1500 at .999
  })
  it('clamps negative inputs', () => {
    expect(jitterDelayMs(-100, -100, () => 0.5)).toBe(0)
  })
})

describe('lintContent', () => {
  it('passes clean plain-text copy', () => {
    const r = lintContent('Quick question about your sales process', 'Hi Jean, saw you lead growth at ACME. Open to a chat?')
    expect(r.ok).toBe(true)
    expect(r.score).toBe(0)
  })
  it('flags spam words', () => {
    const r = lintContent('FREE money guaranteed', 'Click here to buy now')
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.code === 'SPAM_WORD')).toBe(true)
    expect(r.score).toBeGreaterThan(0)
  })
  it('flags more than one link', () => {
    const r = lintContent('Hello', 'See https://a.com and https://b.com now')
    expect(r.issues.some((i) => i.code === 'TOO_MANY_LINKS')).toBe(true)
  })
  it('flags excessive caps', () => {
    const r = lintContent('READ THIS IMMEDIATELY PLEASE', 'THIS IS ALL UPPERCASE TEXT HERE')
    expect(r.issues.some((i) => i.code === 'EXCESSIVE_CAPS')).toBe(true)
  })
  it('flags too many exclamations', () => {
    const r = lintContent('Wow!!!', 'Amazing offer!!!!')
    expect(r.issues.some((i) => i.code === 'TOO_MANY_EXCLAMATIONS')).toBe(true)
  })
  it('flags empty content', () => {
    const r = lintContent('', '')
    expect(r.ok).toBe(false)
    expect(r.issues[0].code).toBe('EMPTY')
  })
})
