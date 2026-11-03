import { describe, it, expect } from 'vitest'
import { evaluateSendGate } from './gate'

const cleanContent = { subject: 'Quick question', body: 'Hi Jean, saw your work at ACME. Open to a chat?' }
const healthyMailbox = { ageDays: 30, sentToday: 5 }

describe('evaluateSendGate', () => {
  it('allows a clean send from a healthy mailbox', () => {
    const d = evaluateSendGate({ suppressed: false, mailbox: healthyMailbox, content: cleanContent })
    expect(d.allowed).toBe(true)
    expect(d.blocks).toHaveLength(0)
  })

  it('blocks a suppressed address', () => {
    const d = evaluateSendGate({ suppressed: true, mailbox: healthyMailbox, content: cleanContent })
    expect(d.allowed).toBe(false)
    expect(d.blocks.some((b) => b.startsWith('SUPPRESSED'))).toBe(true)
  })

  it('blocks when the mailbox cap is reached', () => {
    const d = evaluateSendGate({ suppressed: false, mailbox: { ageDays: 30, sentToday: 50 }, content: cleanContent })
    expect(d.allowed).toBe(false)
    expect(d.blocks.some((b) => b.startsWith('MAILBOX'))).toBe(true)
  })

  it('blocks spammy content over the threshold', () => {
    const spam = { subject: 'FREE money guaranteed act now', body: 'Click here to buy now, 100% risk-free cash winner!!!' }
    const d = evaluateSendGate({ suppressed: false, mailbox: healthyMailbox, content: spam })
    expect(d.allowed).toBe(false)
    expect(d.blocks.some((b) => b.startsWith('CONTENT'))).toBe(true)
  })

  it('warns (not blocks) on mild content issues under the threshold', () => {
    const mild = { subject: 'Hello', body: 'See https://a.com and https://b.com' } // 2 links = score 10
    const d = evaluateSendGate({ suppressed: false, mailbox: healthyMailbox, content: mild, maxContentScore: 30 })
    expect(d.allowed).toBe(true)
    expect(d.warnings.length).toBeGreaterThan(0)
  })

  it('warns when near the daily cap', () => {
    const d = evaluateSendGate({ suppressed: false, mailbox: { ageDays: 30, sentToday: 48 }, content: cleanContent })
    expect(d.allowed).toBe(true)
    expect(d.warnings.some((w) => w.startsWith('MAILBOX_NEAR_CAP'))).toBe(true)
  })

  it('accumulates multiple block reasons', () => {
    const spam = { subject: 'FREE guaranteed', body: 'buy now click here 100% cash winner!!!' }
    const d = evaluateSendGate({ suppressed: true, mailbox: { ageDays: -1, sentToday: 0 }, content: spam })
    expect(d.allowed).toBe(false)
    expect(d.blocks.length).toBeGreaterThanOrEqual(2)
  })
})
