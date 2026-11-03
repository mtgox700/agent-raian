import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the Prisma calls made by pollInboxes/processReply.
const state = vi.hoisted(() => ({
  mailboxes: [] as Array<Record<string, unknown>>,
  sends:     [] as Array<Record<string, unknown>>,
  replies:   [] as Array<Record<string, unknown>>,
  leads:     new Map<string, Record<string, unknown>>(),
  mailboxUpdates: [] as Array<{ id: string; data: Record<string, unknown> }>,
  suppressedLeads: [] as string[],
  suppressedPool: [] as string[],
}))

const mocks = vi.hoisted(() => ({
  fetchImapReplies: vi.fn(),
  classifyReply:    vi.fn(),
  createNotification: vi.fn(),
}))

vi.mock('@/lib/db', () => {
  const emailReply = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      if (where.emailSendId) return state.replies.find((r) => r.emailSendId === where.emailSendId) ?? null
      const id = where.emailSend?.providerMessageId
      const send = state.sends.find((s) => s.providerMessageId === id)
      return send ? state.replies.find((r) => r.emailSendId === send.id) ?? null : null
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.replies.push(data)
      return data
    }),
  }
  const db = {
    connectedMailbox: {
      findMany: vi.fn(async () => state.mailboxes),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.mailboxUpdates.push({ id: where.id, data })
        return {}
      }),
    },
    emailSend: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(state.sends.find((s) => s.id === where.id)!, data)
        return {}
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        if (!where.AND) {
          const email = where.lead.email.equals.toLowerCase()
          return state.sends.find((s) => (s.lead as { email: string }).email.toLowerCase() === email
            && s.mailboxId === where.mailboxId
            && (s.campaign as { workspaceId: string }).workspaceId === where.campaign.workspaceId) ?? null
        }
        const ids = where.AND[0].OR.map((c: Record<string, string>) => Object.values(c)[0])
        const workspaceId = where.AND[1].campaign.workspaceId
        return state.sends.find((s) =>
          (ids.includes(s.providerMessageId as string) || ids.includes(s.providerThreadId as string)) &&
          (s.campaign as { workspaceId: string }).workspaceId === workspaceId,
        ) ?? null
      }),
    },
    emailReply,
    campaign: { update: vi.fn(async () => ({})) },
    globalLead: {
      updateMany: vi.fn(async ({ where }: { where: { email: { in: string[] } } }) => {
        state.suppressedPool.push(...where.email.in)
        return { count: 1 }
      }),
    },
    lead: {
      // A normal lead: the reply handlers drop replies of anonymised (objected) leads.
      findUnique: vi.fn(async () => ({ email: 'jeanne@client.fr' })),
      updateMany: vi.fn(async ({ where }: { where: { email: { in: string[] } } }) => {
        state.suppressedLeads.push(...where.email.in)
        return { count: 1 }
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.leads.set(where.id, { ...(state.leads.get(where.id) ?? {}), ...data })
        return {}
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  }
  return { db }
})

vi.mock('@/lib/security/crypto', () => ({ decrypt: (s: string) => `plain:${s}` }))
vi.mock('@/lib/email/gmail-client', () => ({ fetchGmailReplies: vi.fn(), ensureValidToken: vi.fn() }))
vi.mock('@/lib/email/outlook-client', () => ({ fetchOutlookReplies: vi.fn() }))
vi.mock('@/lib/email/imap-client', () => ({
  fetchImapReplies: mocks.fetchImapReplies,
  imapHostFromSmtp: (h: string) => h.replace(/^smtp\./, 'imap.'),
}))
vi.mock('@/lib/agents/reply-classifier', () => ({ classifyReply: mocks.classifyReply }))
vi.mock('@/lib/services/notifications.service', () => ({
  createNotification: mocks.createNotification,
  buildReplyNotification: (x: unknown) => x,
}))
vi.mock('@/lib/utils/email-parser', () => ({ extractEmailBody: async (_h: string, t: string) => t }))

import { pollInboxes } from './poll-inboxes'

const smtpMailbox = (id: string, workspaceId: string) => ({
  id, provider: 'SMTP', email: `${id}@agency.fr`, workspaceId,
  smtpHost: 'smtp.agency.fr', smtpPasswordEnc: 'enc', lastSyncAt: null,
  accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null,
  lastHistoryId: null, lastDeltaLink: null,
})

const reply = (inReplyTo: string, messageId = '<r1@client.fr>') => ({
  messageId, inReplyToHeader: inReplyTo, fromEmail: 'jeanne@client.fr',
  subject: 'Re: prospection', bodyText: 'Oui, appelons-nous jeudi.', receivedAt: new Date('2026-10-06T08:00:00Z'),
})

beforeEach(() => {
  vi.clearAllMocks()
  state.mailboxes = [smtpMailbox('mb1', 'ws1')]
  state.sends = [{
    id: 'send1', leadId: 'lead1', campaignId: 'camp1', providerMessageId: '<step1@agency.fr>', providerThreadId: null,
    lead: { firstName: 'Jeanne', lastName: 'Martin', company: 'Client', email: 'jeanne@client.fr' },
    status: 'SENT',
    mailboxId: 'mb1',
    campaign: { name: 'Camp', workspaceId: 'ws1', workspace: { owner: { clerkId: 'u1' } } },
  }]
  state.replies = []
  state.leads = new Map()
  state.mailboxUpdates = []
  state.suppressedLeads = []
  state.suppressedPool = []
  mocks.classifyReply.mockResolvedValue({
    classification: 'MEETING_REQUEST', dbClassification: 'MEETING_REQUEST', confidenceInt: 92, confidence: 0.92,
    isAutoReply: false, degraded: false,
  })
  mocks.createNotification.mockResolvedValue({})
})

describe('pollInboxes — SMTP mailboxes over IMAP', () => {
  it('stops the sequence when a lead replies to an SMTP-sent email', async () => {
    mocks.fetchImapReplies.mockResolvedValue([reply('<step1@agency.fr>')])

    const result = await pollInboxes()

    expect(mocks.fetchImapReplies).toHaveBeenCalledWith(expect.objectContaining({
      host: 'imap.agency.fr', user: 'mb1@agency.fr', password: 'plain:enc',
    }))
    expect(result.totalReplies).toBe(1)
    expect(state.replies).toHaveLength(1)
    expect(state.leads.get('lead1')).toMatchObject({ doNotContact: true, status: 'qualified' })
  })

  it('records a reply only once when the same message is polled twice', async () => {
    mocks.fetchImapReplies.mockResolvedValue([reply('<step1@agency.fr>')])

    await pollInboxes()
    await pollInboxes()

    expect(state.replies).toHaveLength(1)
    expect(mocks.classifyReply).toHaveBeenCalledTimes(1)
  })

  it('ignores a reply that does not answer a campaign email', async () => {
    mocks.fetchImapReplies.mockResolvedValue([reply('<personal-thread@friend.fr>')])

    await pollInboxes()

    expect(state.replies).toHaveLength(0)
    expect(mocks.classifyReply).not.toHaveBeenCalled()
    expect(state.leads.size).toBe(0)
  })

  it('never matches a send from another workspace', async () => {
    state.mailboxes = [smtpMailbox('mb2', 'ws2')]
    mocks.fetchImapReplies.mockResolvedValue([reply('<step1@agency.fr>')])

    await pollInboxes()

    expect(state.replies).toHaveLength(0)
  })

  it('keeps polling other mailboxes when one IMAP server fails', async () => {
    state.mailboxes = [smtpMailbox('broken', 'ws1'), smtpMailbox('mb1', 'ws1')]
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchImapReplies
      .mockRejectedValueOnce(new Error('IMAP LOGIN failed'))
      .mockResolvedValueOnce([reply('<step1@agency.fr>')])

    const result = await pollInboxes()

    expect(result.totalErrors).toBe(1)
    expect(state.replies).toHaveLength(1)
    expect(state.mailboxUpdates).toContainEqual({ id: 'broken', data: { lastSyncError: 'IMAP LOGIN failed' } })
  })

  it('logs nothing about unrelated mail (privacy policy promise)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    mocks.fetchImapReplies.mockResolvedValue([reply('<personal-thread@friend.fr>')])

    await pollInboxes()

    const logged = info.mock.calls.flat().join(' ')
    expect(logged).not.toContain('jeanne@client.fr')
    expect(logged).not.toContain('prospection')
    info.mockRestore()
  })

  it('ignores an out-of-office answer: the sequence keeps going and the real reply can still land', async () => {
    mocks.classifyReply.mockResolvedValueOnce({
      classification: 'NEUTRAL', dbClassification: 'NEUTRAL', confidenceInt: 100, confidence: 1,
      isAutoReply: true, degraded: false,
    })
    mocks.fetchImapReplies.mockResolvedValue([reply('<step1@agency.fr>', '<ooo@client.fr>')])

    await pollInboxes()

    expect(state.replies).toHaveLength(0)
    expect(state.leads.get('lead1')).toBeUndefined()
    expect(mocks.createNotification).not.toHaveBeenCalled()
  })

  it('notifies a human reply even when its intent is unclear', async () => {
    mocks.classifyReply.mockResolvedValueOnce({
      classification: 'NEUTRAL', dbClassification: 'NEUTRAL', confidenceInt: 50, confidence: 0.5,
      isAutoReply: false, degraded: true,
    })
    mocks.fetchImapReplies.mockResolvedValue([reply('<step1@agency.fr>')])

    await pollInboxes()

    expect(state.leads.get('lead1')).toMatchObject({ doNotContact: true })
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ classification: 'NEUTRAL' }))
  })

  it('suppresses an address that hard-bounced, everywhere, and marks the email BOUNCED', async () => {
    mocks.fetchImapReplies.mockResolvedValue([{
      messageId: '<dsn@mx>', inReplyToHeader: null, fromEmail: 'mailer-daemon@mx.agency.fr',
      subject: 'Undeliverable: Question rapide',
      bodyText: 'Final-Recipient: rfc822; Jeanne@Client.fr\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 user unknown',
      receivedAt: new Date(),
    }])

    await pollInboxes()

    expect(state.suppressedLeads).toEqual(['jeanne@client.fr'])
    expect(state.suppressedPool).toEqual(['jeanne@client.fr'])
    expect(state.sends[0]).toMatchObject({ status: 'BOUNCED' })
    expect(mocks.classifyReply).not.toHaveBeenCalled()
    expect(state.replies).toHaveLength(0)
  })

  it('keeps an address whose mailbox is only full (temporary failure)', async () => {
    mocks.fetchImapReplies.mockResolvedValue([{
      messageId: '<dsn2@mx>', inReplyToHeader: null, fromEmail: 'postmaster@mx.agency.fr',
      subject: 'Delivery Status Notification (Delay)',
      bodyText: 'Final-Recipient: rfc822; jeanne@client.fr\nAction: delayed\nStatus: 4.2.2 mailbox full',
      receivedAt: new Date(),
    }])

    await pollInboxes()

    expect(state.suppressedLeads).toEqual([])
    expect(state.sends[0].status).toBe('SENT')
  })

  it('never treats a notice about an email sent by another mailbox as a bounce of ours', async () => {
    state.mailboxes = [smtpMailbox('mb2', 'ws1')]
    mocks.fetchImapReplies.mockResolvedValue([{
      messageId: '<dsn3@mx>', inReplyToHeader: null, fromEmail: 'mailer-daemon@mx.other.fr',
      subject: 'Undeliverable: hello',
      bodyText: 'Final-Recipient: rfc822; jeanne@client.fr' + String.fromCharCode(10) + 'Status: 5.1.1',
      receivedAt: new Date(),
    }])

    await pollInboxes()

    expect(state.suppressedLeads).toEqual([])
    expect(state.sends[0].status).toBe('SENT')
  })

  it('processes a human reply sent from a postmaster address as a reply', async () => {
    mocks.fetchImapReplies.mockResolvedValue([{ ...reply('<step1@agency.fr>'), fromEmail: 'postmaster@client.fr', subject: 'Re: prospection' }])

    await pollInboxes()

    expect(state.replies).toHaveLength(1)
    expect(state.leads.get('lead1')).toMatchObject({ doNotContact: true })
  })
})
