import { describe, expect, it, vi } from 'vitest'
import { checkEmailGate, type EmailGateDb } from './email-gate'

const NOW = new Date('2026-10-06T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function makeDb({ suppressed = [] as string[], sentLast24h = 0 } = {}) {
  const db: EmailGateDb = {
    lead: {
      findMany: vi.fn(async ({ where }) =>
        where.email.in.filter((e: string) => suppressed.includes(e)).map((email: string) => ({ email })),
      ),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    emailSend: { count: vi.fn(async () => sentLast24h) },
  }
  return db
}

const content = { subject: 'Question rapide', body: 'Bonjour Jeanne, une question sur votre prospection.' }
const oldMailbox = { id: 'mb1', createdAt: new Date(NOW.getTime() - 60 * DAY) }

describe('checkEmailGate', () => {
  it('allows a clean email from a warmed-up mailbox under its cap', async () => {
    const result = await checkEmailGate({
      db: makeDb({ sentLast24h: 10 }), workspaceId: 'ws1', to: 'jeanne@client.fr', mailbox: oldMailbox, content, now: NOW,
    })
    expect(result).toEqual({ allowed: true })
  })

  it('blocks an address suppressed anywhere in the workspace', async () => {
    const result = await checkEmailGate({
      db: makeDb({ suppressed: ['jeanne@client.fr'] }), workspaceId: 'ws1', to: ' Jeanne@Client.fr ', mailbox: oldMailbox, content, now: NOW,
    })
    expect(result).toMatchObject({ allowed: false, reason: 'SUPPRESSED' })
  })

  it('queues the send when the mailbox reached its daily cap (50 by default)', async () => {
    const db = makeDb({ sentLast24h: 50 })
    const result = await checkEmailGate({ db, workspaceId: 'ws1', to: 'a@b.fr', mailbox: oldMailbox, content, now: NOW })
    expect(result).toMatchObject({ allowed: false, reason: 'MAILBOX_CAP' })
    expect(db.emailSend.count).toHaveBeenCalledWith({
      where: {
        mailboxId: 'mb1',
        status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
        sentAt: { gte: new Date(NOW.getTime() - DAY) },
      },
    })
  })

  it('applies the daily cap chosen by the customer, up to the 500 ceiling', async () => {
    const at300 = await checkEmailGate({
      db: makeDb({ sentLast24h: 299 }), workspaceId: 'ws1', to: 'a@b.fr', mailbox: { ...oldMailbox, dailyCap: 300 }, content, now: NOW,
    })
    const full300 = await checkEmailGate({
      db: makeDb({ sentLast24h: 300 }), workspaceId: 'ws1', to: 'a@b.fr', mailbox: { ...oldMailbox, dailyCap: 300 }, content, now: NOW,
    })
    const tooHigh = await checkEmailGate({
      db: makeDb({ sentLast24h: 500 }), workspaceId: 'ws1', to: 'a@b.fr', mailbox: { ...oldMailbox, dailyCap: 5000 }, content, now: NOW,
    })
    expect(at300).toEqual({ allowed: true })
    expect(full300).toMatchObject({ allowed: false, reason: 'MAILBOX_CAP' })
    expect(tooHigh).toMatchObject({ allowed: false, reason: 'MAILBOX_CAP' })
  })

  it('sends at full cap from day one when warm-up is off (the default)', async () => {
    const fresh = { id: 'mb2', createdAt: new Date(NOW.getTime() - 2 * DAY) }
    const result = await checkEmailGate({ db: makeDb({ sentLast24h: 30 }), workspaceId: 'ws1', to: 'a@b.fr', mailbox: fresh, content, now: NOW })
    expect(result).toEqual({ allowed: true })
  })

  it('ramps up a new mailbox when the customer turned warm-up on (5 per day the first week)', async () => {
    const fresh = { id: 'mb2', createdAt: new Date(NOW.getTime() - 2 * DAY), warmupEnabled: true }
    const atRamp = await checkEmailGate({ db: makeDb({ sentLast24h: 5 }), workspaceId: 'ws1', to: 'a@b.fr', mailbox: fresh, content, now: NOW })
    const underRamp = await checkEmailGate({ db: makeDb({ sentLast24h: 4 }), workspaceId: 'ws1', to: 'a@b.fr', mailbox: fresh, content, now: NOW })
    expect(atRamp).toMatchObject({ allowed: false, reason: 'MAILBOX_CAP' })
    expect(underRamp).toEqual({ allowed: true })
  })

  it('holds the send while the provider pause runs, then lets it go', async () => {
    const paused = { ...oldMailbox, sendPausedUntil: new Date(NOW.getTime() + 10 * 60 * 1000) }
    const expired = { ...oldMailbox, sendPausedUntil: new Date(NOW.getTime() - 1000) }
    const during = await checkEmailGate({ db: makeDb(), workspaceId: 'ws1', to: 'a@b.fr', mailbox: paused, content, now: NOW })
    const after = await checkEmailGate({ db: makeDb(), workspaceId: 'ws1', to: 'a@b.fr', mailbox: expired, content, now: NOW })
    expect(during).toMatchObject({ allowed: false, reason: 'MAILBOX_CAP' })
    expect(after).toEqual({ allowed: true })
  })

  it('a paused mailbox never hides a suppression', async () => {
    const paused = { ...oldMailbox, sendPausedUntil: new Date(NOW.getTime() + 60_000) }
    const result = await checkEmailGate({
      db: makeDb({ suppressed: ['a@b.fr'] }), workspaceId: 'ws1', to: 'a@b.fr', mailbox: paused, content, now: NOW,
    })
    expect(result).toMatchObject({ allowed: false, reason: 'SUPPRESSED' })
  })

  it('does not apply a mailbox cap to the shared Resend domain (no mailbox)', async () => {
    const db = makeDb()
    const result = await checkEmailGate({ db, workspaceId: 'ws1', to: 'a@b.fr', mailbox: null, content, now: NOW })
    expect(result).toEqual({ allowed: true })
    expect(db.emailSend.count).not.toHaveBeenCalled()
  })

  it('blocks content that looks like spam', async () => {
    const spammy = {
      subject: 'FREE MONEY!!! ACT NOW 100% GUARANTEED',
      body: 'CLICK HERE http://a.co http://b.co http://c.co http://d.co http://e.co risk-free winner $$$ urgent cash bonus',
    }
    const result = await checkEmailGate({ db: makeDb(), workspaceId: 'ws1', to: 'a@b.fr', mailbox: oldMailbox, content: spammy, now: NOW })
    expect(result).toMatchObject({ allowed: false, reason: 'CONTENT_FLAGGED' })
  })
})
