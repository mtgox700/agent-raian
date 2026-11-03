/**
 * sendStepToLead — email path, against an in-memory database.
 * Covers the promises made to prospects and customers: never email someone
 * who replied or opted out, never exceed a mailbox's capacity, never send
 * spam-looking content, never send the same step twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  routeSend: vi.fn(),
  resolveSendingMailbox: vi.fn(),
  trackServer: vi.fn(),
}))

vi.mock('@/lib/analytics/server-events', () => ({
  trackServer: mocks.trackServer,
  flushServerEvents: vi.fn(async () => {}),
}))

vi.mock('@/lib/email/sender-router', () => ({
  routeSend: mocks.routeSend,
  resolveSendingMailbox: mocks.resolveSendingMailbox,
}))
vi.mock('@/lib/services/resend-client', () => ({
  renderEmailTemplate: (t: string, v: Record<string, string>) => t.replace(/\{\{(\w+)\}\}/g, (_m, k) => v[k] ?? ''),
  renderSubject: (t: string, v: Record<string, string>) => t.replace(/\{\{(\w+)\}\}/g, (_m, k) => v[k] ?? ''),
  textToHtml: (text: string) => `<p>${text}</p>`,
}))
vi.mock('@/lib/multichannel/unipile', () => ({
  linkedInPublicIdentifier: vi.fn(), resolveLinkedInProviderId: vi.fn(),
  sendLinkedInMessage: vi.fn(), sendLinkedInInvitation: vi.fn(),
}))

import { sendStepToLead } from './send-step'

type Row = Record<string, any>

function makeDb() {
  const state = {
    sends: [] as Row[],
    leads: [] as Row[],
    steps: [] as Row[],
    workspace: { sendingDomain: null, emailSignature: null } as Row,
    mailboxes: [] as Row[],
    notifications: [] as Row[],
    touches: [] as Row[],
    campaignStatus: 'ACTIVE',
    campaignSent: 0,
  }
  let seq = 0
  const matchesSent = (r: Row) => ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'].includes(r.status)
  const db = {
    emailSend: {
      findFirst: vi.fn(async ({ where }: { where: Row }) =>
        state.sends.find((r) => r.leadId === where.leadId && r.emailStepId === where.emailStepId
          && (typeof where.status === 'string' ? r.status === where.status : matchesSent(r))) ?? null),
      aggregate: vi.fn(async ({ where }: { where: Row }) => {
        const rows = state.sends.filter((r) => r.leadId === where.leadId && r.emailStepId === where.emailStepId
          && where.status.in.includes(r.status))
        return { _max: { attempts: rows.length ? Math.max(...rows.map((r) => r.attempts ?? 0)) : null } }
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const rows = state.sends.filter((r) => r.leadId === where.leadId && r.emailStepId === where.emailStepId && r.status === where.status)
        rows.forEach((r) => Object.assign(r, data))
        return { count: rows.length }
      }),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        state.sends = state.sends.filter((r) => !(r.leadId === where.leadId && r.emailStepId === where.emailStepId
          && where.status.in.includes(r.status)))
        return { count: 0 }
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `send${++seq}`, createdAt: new Date(), ...data }
        state.sends.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = state.sends.find((r) => r.id === where.id)!
        for (const [k, v] of Object.entries(data)) {
          row[k] = v && typeof v === 'object' && 'increment' in v ? (row[k] ?? 0) + (v as Row).increment : v
        }
        return row
      }),
      count: vi.fn(async ({ where }: { where: Row }) => {
        const since = where.sentAt.gte as Date
        return state.sends.filter((r) => matchesSent(r) && r.sentAt >= since
          && (where.mailboxId ? r.mailboxId === where.mailboxId : true)).length
      }),
    },
    lead: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => state.leads.find((l) => l.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        Object.assign(state.leads.find((l) => l.id === where.id)!, data)
        return {}
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        state.leads.filter((l) => l.workspaceId === where.workspaceId && l.doNotContact
          && where.email.in.includes(l.email.toLowerCase())).map((l) => ({ email: l.email }))),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    campaignEmailStep: { findUnique: vi.fn(async ({ where }: { where: Row }) => state.steps.find((s) => s.id === where.id) ?? null) },
    workspace: { findUnique: vi.fn(async () => state.workspace) },
    campaign: {
      update: vi.fn(async () => {
        state.campaignSent += 1
        return { sentCount: state.campaignSent, workspaceId: 'ws1', workspace: { owner: { clerkId: 'user_1' } } }
      }),
      findUnique: vi.fn(async () => ({ status: state.campaignStatus, ownerUserId: 'u1' })),
    },
    connectedMailbox: {
      // The campaign's mailbox, or one serving its owner (u1): theirs or shared.
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const serving = (where.OR as Row[] | undefined)?.find((o) => o.workspaceId) ?? where
        const owner = (m: Row) => m.ownerUserId ?? 'u1'
        return state.mailboxes.find((m) => m.workspaceId === serving.workspaceId
          && (!serving.OR || (serving.OR as Row[]).some((o) => o.ownerUserId === owner(m) || (o.sharedWithTeam && m.sharedWithTeam)))
          && (!serving.ownerUserId?.not || (owner(m) !== serving.ownerUserId.not && !m.sharedWithTeam))) ?? null
      }),
    },
    leadTouch: {
      create: vi.fn(async ({ data }: { data: Row }) => { state.touches.push(data); return data }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    notification: {
      findFirst: vi.fn(async ({ where }: { where: Row }) =>
        state.notifications.find((n) => n.workspaceId === where.workspaceId && n.type === where.type) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => { state.notifications.push(data); return data }),
    },
  }
  return { db, state }
}

const DAY = 24 * 60 * 60 * 1000
const warmMailbox = { id: 'mb1', provider: 'GMAIL', createdAt: new Date(Date.now() - 60 * DAY) }

function seed(state: ReturnType<typeof makeDb>['state'], over: Row = {}) {
  state.leads.push({
    id: 'lead1', workspaceId: 'ws1', email: 'jeanne@client.fr', firstName: 'Jeanne', lastName: 'Martin',
    company: 'Client', title: 'CEO', industry: null, doNotContact: false, status: 'new', linkedinUrl: null, campaignId: 'camp1', ...over,
  })
  state.steps.push({ id: 'step1', subject: 'Question pour {{company}}', body: 'Bonjour {{firstName}}, une question rapide sur votre prospection.', channel: 'EMAIL', inviteNote: null })
}

const params = { leadId: 'lead1', campaignId: 'camp1', stepId: 'step1', workspaceId: 'ws1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.EMAIL_MIN_GAP_SECONDS = '0'
  delete process.env.EMAIL_DAILY_CAP
  mocks.resolveSendingMailbox.mockResolvedValue(warmMailbox)
  mocks.routeSend.mockResolvedValue({
    messageId: 'm1', providerMessageId: '<m1@client>', providerThreadId: 't1', provider: 'gmail', mailboxId: 'mb1',
  })
})

describe('sendStepToLead — email', () => {
  it('sends from the resolved mailbox and records which mailbox sent it', async () => {
    const { db, state } = makeDb()
    seed(state)

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result.status).toBe('sent')
    expect(mocks.routeSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'jeanne@client.fr', subject: 'Question pour Client',
    }), warmMailbox)
    expect(state.sends[0]).toMatchObject({ status: 'SENT', mailboxId: 'mb1', providerMessageId: '<m1@client>' })
    expect(state.leads[0].status).toBe('contacted')
  })

  it('puts an unsubscribe link and a reply address on every email', async () => {
    const { db, state } = makeDb()
    seed(state)

    await sendStepToLead({ db: db as never, ...params })

    const sent = mocks.routeSend.mock.calls[0][0]
    expect(sent.listUnsubscribeUrl).toContain('/api/webhooks/unsubscribe')
    expect(sent.replyTo).toMatch(/^reply\+send\d+@/)
  })

  it('records the activation milestone when the campaign\'s first message leaves, and only then', async () => {
    const { db, state } = makeDb()
    seed(state)

    await sendStepToLead({ db: db as never, ...params })
    expect(mocks.trackServer).toHaveBeenCalledWith('user_1', 'first_email_sent', { workspaceId: 'ws1', campaignId: 'camp1' })

    state.campaignSent = 5
    mocks.trackServer.mockClear()
    state.leads.push({ ...state.leads[0], id: 'lead2', email: 'paul@client.fr' })
    await sendStepToLead({ db: db as never, ...params, leadId: 'lead2' })
    expect(mocks.trackServer).not.toHaveBeenCalled()
  })

  it('a lead queued for outreach becomes contacted once its message leaves', async () => {
    const { db, state } = makeDb()
    seed(state, { status: 'queued' })

    await sendStepToLead({ db: db as never, ...params })

    expect(state.leads[0].status).toBe('contacted')
  })

  it('never sends the same step twice', async () => {
    const { db, state } = makeDb()
    seed(state)

    await sendStepToLead({ db: db as never, ...params })
    const second = await sendStepToLead({ db: db as never, ...params })

    expect(second).toEqual({ status: 'skipped', reason: 'ALREADY_SENT' })
    expect(mocks.routeSend).toHaveBeenCalledTimes(1)
  })

  it('closes the queued row of a lead who replied, so the campaign queue moves on', async () => {
    const { db, state } = makeDb()
    seed(state, { doNotContact: true })
    state.sends.push({ id: 'queued', leadId: 'lead1', emailStepId: 'step1', status: 'PENDING', attempts: 0, createdAt: new Date() })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'DNC' })
    expect(state.sends[0]).toMatchObject({ status: 'FAILED', attempts: 3 })
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('never sends an old campaign\'s sequence to a lead moved to another campaign', async () => {
    const { db, state } = makeDb()
    seed(state, { campaignId: 'other-campaign' })
    state.sends.push({ id: 'queued', leadId: 'lead1', emailStepId: 'step1', status: 'PENDING', attempts: 0, createdAt: new Date() })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'LEAD_MOVED' })
    expect(state.sends[0]).toMatchObject({ status: 'FAILED', attempts: 3 })
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('sends nothing for a paused campaign and keeps the email queued', async () => {
    const { db, state } = makeDb()
    seed(state)
    state.campaignStatus = 'PAUSED'
    state.sends.push({ id: 'queued', leadId: 'lead1', emailStepId: 'step1', status: 'PENDING', attempts: 0, createdAt: new Date() })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'CAMPAIGN_INACTIVE' })
    expect(state.sends[0].status).toBe('PENDING')
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('never emails a lead who replied or opted out', async () => {
    const { db, state } = makeDb()
    seed(state, { doNotContact: true })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'DNC' })
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('never emails an address that opted out through another campaign of the workspace', async () => {
    const { db, state } = makeDb()
    seed(state)
    state.leads.push({ id: 'lead-other', workspaceId: 'ws1', email: 'Jeanne@Client.fr', doNotContact: true })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'SUPPRESSED' })
    expect(mocks.routeSend).not.toHaveBeenCalled()
    expect(state.leads[0].doNotContact).toBe(true)
  })

  it('keeps the email queued when the mailbox reached its daily cap', async () => {
    const { db, state } = makeDb()
    seed(state)
    for (let i = 0; i < 50; i++) {
      state.sends.push({ id: `old${i}`, leadId: `x${i}`, emailStepId: 's', status: 'SENT', mailboxId: 'mb1', sentAt: new Date() })
    }

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'MAILBOX_CAP' })
    expect(state.sends.find((r) => r.leadId === 'lead1')?.status).toBe('PENDING')
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('ramps a newly connected mailbox when warm-up is on: the 6th email of the day waits', async () => {
    const { db, state } = makeDb()
    seed(state)
    mocks.resolveSendingMailbox.mockResolvedValue({ ...warmMailbox, warmupEnabled: true, createdAt: new Date(Date.now() - 1 * DAY) })
    for (let i = 0; i < 5; i++) {
      state.sends.push({ id: `old${i}`, leadId: `x${i}`, emailStepId: 's', status: 'SENT', mailboxId: 'mb1', sentAt: new Date() })
    }

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'MAILBOX_CAP' })
    expect(state.sends.find((r) => r.leadId === 'lead1')?.status).toBe('PENDING')
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('refuses spam-looking content and records why', async () => {
    const { db, state } = makeDb()
    seed(state)
    state.steps[0] = {
      ...state.steps[0],
      subject: 'FREE MONEY!!! ACT NOW 100% GUARANTEED',
      body: 'CLICK HERE http://a.co http://b.co http://c.co http://d.co http://e.co risk-free winner $$$ urgent cash bonus',
    }

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'CONTENT_FLAGGED' })
    expect(state.sends[0]).toMatchObject({ status: 'FAILED' })
    expect(state.sends[0].errorMessage).toMatch(/CONTENT/)
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('records a provider failure as FAILED, never as sent', async () => {
    const { db, state } = makeDb()
    seed(state)
    mocks.routeSend.mockRejectedValue(new Error('SMTP 550'))

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'error', error: 'SMTP 550' })
    expect(state.sends[0]).toMatchObject({ status: 'FAILED', attempts: 1, errorMessage: 'SMTP 550' })
  })

  it('gives up after 3 failed attempts instead of retrying forever', async () => {
    const { db, state } = makeDb()
    seed(state)
    mocks.routeSend.mockRejectedValue(new Error('550 mailbox unavailable'))

    for (let i = 0; i < 3; i++) await sendStepToLead({ db: db as never, ...params })
    const fourth = await sendStepToLead({ db: db as never, ...params })

    expect(fourth).toEqual({ status: 'skipped', reason: 'GAVE_UP' })
    expect(mocks.routeSend).toHaveBeenCalledTimes(3)
    expect(state.sends).toHaveLength(1)
    expect(state.sends[0].attempts).toBe(3)
  })

  it('waits for a reconnect instead of sending from the shared domain when the mailbox is disconnected', async () => {
    const { db, state } = makeDb()
    seed(state)
    state.mailboxes.push({ workspaceId: 'ws1', email: 'z@agency.fr', status: 'EXPIRED' })
    mocks.resolveSendingMailbox.mockResolvedValue(null)

    const first = await sendStepToLead({ db: db as never, ...params })
    await sendStepToLead({ db: db as never, ...params })

    expect(first).toEqual({ status: 'skipped', reason: 'MAILBOX_DISCONNECTED' })
    expect(mocks.routeSend).not.toHaveBeenCalled()
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({ type: 'MAILBOX_DISCONNECTED' })
  })

  it("a member without a mailbox in a team that sends from its own waits, never takes the shared domain", async () => {
    const { db, state } = makeDb()
    seed(state)
    state.mailboxes.push({ workspaceId: 'ws1', email: 'colleague@agency.fr', status: 'CONNECTED', ownerUserId: 'u2' })
    mocks.resolveSendingMailbox.mockResolvedValue(null)

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'NO_SENDER' })
    expect(mocks.routeSend).not.toHaveBeenCalled()
    expect(state.notifications[0]).toMatchObject({ userId: 'u1', title: 'Aucune boîte d’envoi' })
  })

  it("a shared colleague mailbox, once disconnected, does not stop a member from the shared domain logic", async () => {
    const { db, state } = makeDb()
    seed(state)
    state.mailboxes.push({ workspaceId: 'ws1', email: 'colleague@agency.fr', status: 'EXPIRED', ownerUserId: 'u2', sharedWithTeam: true })
    mocks.resolveSendingMailbox.mockResolvedValue(null)
    mocks.routeSend.mockResolvedValue({ messageId: 'r1', providerMessageId: null, providerThreadId: null, provider: 'resend', mailboxId: null })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).not.toEqual({ status: 'skipped', reason: 'NO_SENDER' })
  })

  it('uses the shared domain only for a workspace that never connected a mailbox', async () => {
    const { db, state } = makeDb()
    seed(state)
    mocks.resolveSendingMailbox.mockResolvedValue(null)
    mocks.routeSend.mockResolvedValue({ messageId: 'r1', providerMessageId: null, providerThreadId: null, provider: 'resend', mailboxId: null })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result.status).toBe('sent')
    expect(mocks.routeSend).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('marks the email SENDING before calling the provider', async () => {
    const { db, state } = makeDb()
    seed(state)
    let statusDuringCall: string | undefined
    mocks.routeSend.mockImplementation(async () => {
      statusDuringCall = state.sends[0].status
      return { messageId: 'm1', providerMessageId: '<m1>', providerThreadId: null, provider: 'gmail', mailboxId: 'mb1' }
    })

    await sendStepToLead({ db: db as never, ...params })

    expect(statusDuringCall).toBe('SENDING')
    expect(state.sends[0].status).toBe('SENT')
  })

  it('never sends twice after a crash mid-send: an old SENDING row is abandoned', async () => {
    const { db, state } = makeDb()
    seed(state)
    state.sends.push({ id: 'crashed', leadId: 'lead1', emailStepId: 'step1', status: 'SENDING', createdAt: new Date(Date.now() - 60 * 60 * 1000) })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'GAVE_UP' })
    expect(mocks.routeSend).not.toHaveBeenCalled()
    expect(state.sends[0]).toMatchObject({ status: 'FAILED', attempts: 3 })
  })

  it('leaves a send in progress to its worker', async () => {
    const { db, state } = makeDb()
    seed(state)
    state.sends.push({ id: 'live', leadId: 'lead1', emailStepId: 'step1', status: 'SENDING', createdAt: new Date() })

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'IN_FLIGHT' })
    expect(mocks.routeSend).not.toHaveBeenCalled()
  })

  it('keeps a delivered email SENT even if the campaign counter update fails (no double send)', async () => {
    const { db, state } = makeDb()
    seed(state)
    db.campaign.update.mockRejectedValue(new Error('deadlock'))

    const first = await sendStepToLead({ db: db as never, ...params })
    const second = await sendStepToLead({ db: db as never, ...params })

    expect(first.status).toBe('sent')
    expect(state.sends[0].status).toBe('SENT')
    expect(second).toEqual({ status: 'skipped', reason: 'ALREADY_SENT' })
    expect(mocks.routeSend).toHaveBeenCalledTimes(1)
  })
})

describe('sendStepToLead — WhatsApp / SMS steps', () => {
  function seedPhone(state: ReturnType<typeof makeDb>['state'], channel: 'WHATSAPP' | 'SMS', phone: string | null) {
    seed(state, { phone })
    state.steps[0] = { id: 'step1', subject: '', body: '{{firstName}}, Ayoub de Phantera : un mot sur votre prospection ?', channel, inviteNote: null }
  }

  it('never sends anything itself: drafts the message into the "À envoyer" queue of the user', async () => {
    const { db, state } = makeDb()
    seedPhone(state, 'WHATSAPP', '33612345678')

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'AWAITING_USER' })
    expect(mocks.routeSend).not.toHaveBeenCalled()
    expect(state.sends[0].status).toBe('AWAITING_USER')
    expect(state.touches[0]).toMatchObject({ channel: 'WHATSAPP', status: 'TODO', emailSendId: state.sends[0].id, leadId: 'lead1' })
    expect(state.touches[0].body).toBe('Jeanne, Ayoub de Phantera : un mot sur votre prospection ?')
  })

  it('adds the STOP line to an SMS', async () => {
    const { db, state } = makeDb()
    seedPhone(state, 'SMS', '33612345678')
    await sendStepToLead({ db: db as never, ...params })
    expect(state.touches[0].body).toMatch(/Répondez STOP pour ne plus être contacté\.$/)
  })

  it('passes over the step for a lead without a number, so the sequence goes on', async () => {
    const { db, state } = makeDb()
    seedPhone(state, 'SMS', null)

    const result = await sendStepToLead({ db: db as never, ...params })

    expect(result).toEqual({ status: 'skipped', reason: 'NO_PHONE' })
    expect(state.sends[0].status).toBe('SKIPPED')
    expect(state.touches).toHaveLength(0)
  })

  it('drafts nothing for a lead who replied or opted out', async () => {
    const { db, state } = makeDb()
    seedPhone(state, 'WHATSAPP', '33612345678')
    state.leads[0].doNotContact = true
    expect(await sendStepToLead({ db: db as never, ...params })).toEqual({ status: 'skipped', reason: 'DNC' })
    expect(state.touches).toHaveLength(0)
  })
})

