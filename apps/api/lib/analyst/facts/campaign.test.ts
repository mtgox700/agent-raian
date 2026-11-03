/**
 * The aggregation logic of getCampaignFacts, on a simulated database. The
 * SQL itself runs against Postgres in the sandbox check (cross-checked with
 * plain counts); here, what is made of the rows.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sequences/send-status', () => ({
  getSendStatus: vi.fn(async () => ({ queued: 3, hold: 'MAILBOX_CAP', resumesAt: null, sender: 'a@b.fr', sentLast24h: 50, dailyLimit: 50, quota: { current: 10, limit: null } })),
}))

import { getCampaignFacts, rate } from './campaign'

const NOW = new Date('2026-10-17T12:00:00Z')
const owner = { workspaceId: 'ws', userId: 'u1', role: 'OWNER' as const }

function fakeDb(found = true) {
  const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?')
    if (sql.includes('"classification" AS cls')) return [
      { step: 's1', cls: 'POSITIVE', n: 2 }, { step: 's1', cls: 'NEGATIVE', n: 1 }, { step: 's1', cls: null, n: 3 },
      { step: 's2', cls: 'NEUTRAL', n: 1 }, { step: 's2', cls: null, n: 1 },
    ]
    if (sql.includes('min("sentAt")')) return [{ first: new Date('2026-10-07T12:00:00Z'), last: new Date('2026-10-16T09:00:00Z') }]
    if (sql.includes('percentile_disc')) return [{ median: 20.5, p90: 71, n: 24 }]
    if (sql.includes('AS anonymised')) return [{ total: 60, contacted: 40, replied: 4, positive: 2, anonymised: 1, dnc: 5, converted: 1 }]
    if (sql.includes('"emailStatus"')) return [{ status: 'valid', n: 50 }, { status: 'non vérifié', n: 9 }]
    if (sql.includes('ISODOW')) return [{ weekday: 2, hour: 9, sent: 30 }]
    if (sql.includes('count(DISTINCT l."id")')) return [{ value: 'saas', leads: 30, contacted: 20, replied: 3 }, { value: '', leads: 5, contacted: 4, replied: 0 }]
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`)
  })
  return {
    campaign: {
      findFirst: vi.fn(async () => found ? {
        id: 'c1', name: 'Campagne', status: 'ACTIVE', ownerUserId: 'u1', createdAt: new Date('2026-10-06T00:00:00Z'), senderLostAt: null, workspaceId: 'ws',
        emailSteps: [
          { id: 's1', position: 1, dayOffset: 0, channel: 'EMAIL', subject: 'Question {{company}}', body: 'Bonjour {{firstName}} ?' },
          { id: 's2', position: 2, dayOffset: 4, channel: 'EMAIL', subject: 'Relance', body: 'Toujours partant ?' },
        ],
      } : null),
    },
    emailSend: {
      groupBy: vi.fn(async ({ by }: { by: string[] }) => by[0] === 'emailStepId'
        ? [
            { emailStepId: 's1', status: 'SENT', _count: { _all: 30 } },
            { emailStepId: 's1', status: 'OPENED', _count: { _all: 10 } },
            { emailStepId: 's1', status: 'BOUNCED', _count: { _all: 2 } },
            { emailStepId: 's2', status: 'PENDING', _count: { _all: 3 } },
            { emailStepId: 's2', status: 'SENT', _count: { _all: 25 } },
            { emailStepId: 's2', status: 'FAILED', _count: { _all: 1 } },
          ]
        : [
            { mailboxId: 'mb1', status: 'SENT', _count: { _all: 55 } },
            { mailboxId: 'mb1', status: 'BOUNCED', _count: { _all: 2 } },
            { mailboxId: null, status: 'SENT', _count: { _all: 10 } },
          ]),
    },
    connectedMailbox: { findMany: vi.fn(async ({ where }: { where: { workspaceId: string } }) => where.workspaceId === 'ws' ? [{ id: 'mb1', email: 'ayoub@acme.fr', status: 'CONNECTED', sendPausedUntil: null, dailyCap: 50 }] : []) },
    notification: { count: vi.fn(async () => 2) },
    $queryRaw: queryRaw,
  }
}

describe('getCampaignFacts', () => {
  it('nothing for a campaign outside the caller’s scope', async () => {
    expect(await getCampaignFacts(fakeDb(false) as never, owner, 'c1', NOW)).toBeNull()
  })

  it('builds the funnel per step from statuses and replies', async () => {
    const f = (await getCampaignFacts(fakeDb() as never, owner, 'c1', NOW))!
    const [s1, s2] = f.funnel
    expect(s1).toMatchObject({ sent: 40, delivered: 10, bounced: 2, replies: { positive: 2, negative: 1, neutral: 0, total: 3 } })
    expect(s1.replyRate.rate).toBeCloseTo(3 / 40, 10)
    expect(s1.bounceRate.n).toBe(42)
    expect(s2).toMatchObject({ queued: 3, sent: 25, failed: 1, replies: { total: 1 } })
  })

  it('lead counts, reply rate with its interval, meetings, age', async () => {
    const f = (await getCampaignFacts(fakeDb() as never, owner, 'c1', NOW))!
    expect(f.leads).toEqual({ total: 60, contacted: 40, replied: 4, anonymised: 1, doNotContact: 5 })
    expect(f.replyRate.rate).toBeCloseTo(0.1, 10)
    expect(f.replyRate.ci.low).toBeGreaterThan(0)
    expect(f.meetings).toBe(2)
    expect(f.converted).toBe(1)
    expect(f.ageDays).toBeCloseTo(10, 5)
    expect(f.replyDelayHours).toEqual({ median: 20.5, p90: 71, n: 24 })
    expect(f.positiveRate.rate).toBeCloseTo(0.05, 10)
  })

  it('mailboxes, the shared domain, segments, enrichment, rhythm, messages', async () => {
    const f = (await getCampaignFacts(fakeDb() as never, owner, 'c1', NOW))!
    expect(f.mailboxes.find((m) => m.mailboxId === 'mb1')).toMatchObject({ label: 'ayoub@acme.fr', sent: 55, bounced: 2 })
    expect(f.mailboxes.find((m) => m.mailboxId === null)?.label).toBe('domaine partagé Phantera')
    expect(f.targeting.industry[0]).toMatchObject({ value: 'saas', unknown: false, contacted: 20, replied: 3 })
    expect(f.targeting.industry[1]).toMatchObject({ value: '(non renseigné)', unknown: true })
    expect(f.enrichment).toEqual({ valid: 50, 'non vérifié': 9 })
    expect(f.rhythm).toEqual([{ weekday: 2, hour: 9, sent: 30 }])
    expect(f.messages.map((m) => m.gapDays)).toEqual([0, 4])
    expect(f.sendStatus.hold).toBe('MAILBOX_CAP')
  })

  it('no reply delay under 20 replies: one observation is not a distribution', async () => {
    const db = fakeDb()
    const original = db.$queryRaw.getMockImplementation()!
    db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join('?').includes('percentile_disc') ? [{ median: 2, p90: 3, n: 19 }] : original(strings))
    expect((await getCampaignFacts(db as never, owner, 'c1', NOW))!.replyDelayHours).toBeNull()
  })

  it('a step never shows more replying leads than messages sent', async () => {
    const f = (await getCampaignFacts(fakeDb() as never, owner, 'c1', NOW))!
    for (const s of f.funnel) expect(s.replies.total).toBeLessThanOrEqual(s.sent)
  })
})

describe('rate()', () => {
  it('never more successes than trials, and an interval even at zero', () => {
    expect(rate(0, 0)).toMatchObject({ rate: 0, ci: { low: 0, high: 1 } })
    expect(rate(5, 3).ci.high).toBe(1)
  })
})
