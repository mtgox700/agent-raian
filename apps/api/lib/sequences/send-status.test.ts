import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolveSendingMailbox: vi.fn(), checkEmailSendQuota: vi.fn() }))
vi.mock('@/lib/email/sender-router', () => ({ resolveSendingMailbox: mocks.resolveSendingMailbox }))
vi.mock('@/lib/stripe/quota', () => ({ checkEmailSendQuota: mocks.checkEmailSendQuota }))

import { getSendStatus } from './send-status'

const DAY = 24 * 60 * 60 * 1000
const oldMailbox = {
  id: 'mb1', email: 'ayoub@client.fr', createdAt: new Date(Date.now() - 60 * DAY),
  dailyCap: 50, warmupEnabled: false, sendPausedUntil: null as Date | null,
}

function makeDb({ queued = 87, sent24h = 0, oldestSentAt = new Date(Date.now() - 20 * 3600 * 1000) } = {}) {
  return {
    emailSend: {
      count: vi.fn(async ({ where }: { where: { status: unknown } }) => (where.status === 'PENDING' ? queued : sent24h)),
      findFirst: vi.fn(async () => ({ sentAt: oldestSentAt })),
    },
    connectedMailbox: { findFirst: vi.fn(async () => null) },
    campaign: { findUnique: vi.fn(async () => ({ ownerUserId: 'u1' })) },
  }
}

const params = { workspaceId: 'ws1', campaignId: 'c1', campaignActive: true }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveSendingMailbox.mockResolvedValue(oldMailbox)
  mocks.checkEmailSendQuota.mockResolvedValue({ allowed: true, current: 120, limit: 5000 })
})

describe('getSendStatus', () => {
  it('says the daily cap of the mailbox holds the queue, and when it frees up', async () => {
    const oldest = new Date(Date.now() - 20 * 3600 * 1000)
    const status = await getSendStatus(makeDb({ sent24h: 50, oldestSentAt: oldest }) as never, params)

    expect(status).toMatchObject({ queued: 87, hold: 'MAILBOX_CAP', sentLast24h: 50, dailyLimit: 50, sender: 'ayoub@client.fr' })
    expect(status.resumesAt).toBe(new Date(oldest.getTime() + DAY).toISOString())
  })

  it('says the monthly plan quota holds the queue', async () => {
    mocks.checkEmailSendQuota.mockResolvedValue({ allowed: false, current: 100, limit: 100 })
    const status = await getSendStatus(makeDb({ sent24h: 13 }) as never, params)
    expect(status).toMatchObject({ hold: 'QUOTA', quota: { current: 100, limit: 100 } })
  })

  it('reports a provider pause with its end', async () => {
    const until = new Date(Date.now() + 15 * 60 * 1000)
    mocks.resolveSendingMailbox.mockResolvedValue({ ...oldMailbox, sendPausedUntil: until })
    const status = await getSendStatus(makeDb({ sent24h: 13 }) as never, params)
    expect(status).toMatchObject({ hold: 'MAILBOX_PAUSED', resumesAt: until.toISOString() })
  })

  it('reports a paused campaign before anything else', async () => {
    const status = await getSendStatus(makeDb({ sent24h: 50 }) as never, { ...params, campaignActive: false })
    expect(status.hold).toBe('CAMPAIGN_PAUSED')
  })

  it('no hold while the mailbox still has room: the queue is just sending', async () => {
    const status = await getSendStatus(makeDb({ sent24h: 13 }) as never, params)
    expect(status).toMatchObject({ hold: null, sentLast24h: 13, dailyLimit: 50 })
  })

  it('a disconnected mailbox holds the queue instead of falling back to the shared domain', async () => {
    mocks.resolveSendingMailbox.mockResolvedValue(null)
    const db = makeDb({ sent24h: 0 })
    db.connectedMailbox.findFirst.mockResolvedValue({ email: 'gone@client.fr' } as never)
    const status = await getSendStatus(db as never, params)
    expect(status.hold).toBe('MAILBOX_DISCONNECTED')
  })

  it('a member without a mailbox, in a team sending from its own, is told so: same rule as the sender', async () => {
    mocks.resolveSendingMailbox.mockResolvedValue(null)
    const db = makeDb({ sent24h: 0 })
    db.connectedMailbox.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'colleague' } as never)
    const status = await getSendStatus(db as never, params)
    expect(status.hold).toBe('NO_SENDER')
  })

  it('nothing queued: no hold reported', async () => {
    const status = await getSendStatus(makeDb({ queued: 0, sent24h: 50 }) as never, params)
    expect(status).toMatchObject({ queued: 0, hold: null, resumesAt: null })
  })
})
