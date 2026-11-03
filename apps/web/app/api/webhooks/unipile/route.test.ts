import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const replies: Array<Record<string, unknown>> = []
  const tx = {
    emailReply: {
      findFirst: vi.fn(async ({ where }: { where: { bodyText: string } }) =>
        replies.find((r) => r.bodyText === where.bodyText) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { replies.push(data); return data }),
    },
    campaign: { update: vi.fn(async () => ({})) },
    lead: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({ email: 'camille@acme.fr' })) },
  }
  return {
    replies,
    tx,
    db: {
      connectedChannel: { findUnique: vi.fn(async () => ({ workspaceId: 'w1' })) },
      emailSend: {
        findFirst: vi.fn(async () => ({
          id: 's1', leadId: 'l1', campaignId: 'c1',
          emailStep: { subject: 'Bonjour' },
          lead: { firstName: 'Camille', lastName: 'Martin', company: 'Acme' },
          campaign: { name: 'Campagne LinkedIn' },
        })),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    },
    classifyReply: vi.fn(),
    createNotification: vi.fn(async () => ({})),
  }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/multichannel/webhook-auth', () => ({ verifyUnipileWebhook: () => 'ok', describeRejection: () => '' }))
vi.mock('@/lib/agents/reply-classifier', () => ({ classifyReply: mocks.classifyReply }))
vi.mock('@/lib/services/notifications.service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/notifications.service')>('@/lib/services/notifications.service')
  return { buildReplyNotification: actual.buildReplyNotification, createNotification: mocks.createNotification }
})

import { POST } from './route'

const reply = (text: string) => new Request('https://x/api/webhooks/unipile', {
  method: 'POST',
  body: JSON.stringify({ account_id: 'acc', sender: { attendee_provider_id: 'prov-1' }, message: { text } }),
})

const classified = (classification: string, dbClassification = classification) => ({
  classification, dbClassification, confidenceInt: 90, isAutoReply: false,
})

beforeEach(() => {
  mocks.replies.length = 0
  vi.clearAllMocks()
})

describe('LinkedIn reply webhook', () => {
  it('records a meeting request as unread, qualifies the lead and notifies with the lead link', async () => {
    mocks.classifyReply.mockResolvedValue(classified('MEETING_REQUEST'))
    const res = await POST(reply('Avec plaisir, appelons-nous jeudi'))
    expect(res.status).toBe(200)

    expect(mocks.replies).toHaveLength(1)
    expect(mocks.replies[0]).not.toHaveProperty('isProcessed', true)
    expect(mocks.tx.lead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ doNotContact: true, status: 'qualified', lastReplyClassification: 'MEETING_REQUEST' }),
    }))
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'LEAD_REPLIED_MEETING', leadId: 'l1', campaignId: 'c1',
    }))
  })

  it('does not record or notify twice when Unipile replays the webhook', async () => {
    mocks.classifyReply.mockResolvedValue(classified('POSITIVE'))
    await POST(reply('Intéressé'))
    await POST(reply('Intéressé'))
    expect(mocks.replies).toHaveLength(1)
    expect(mocks.createNotification).toHaveBeenCalledTimes(1)
  })

  it('a failed insert fails the request instead of leaving a half-updated lead', async () => {
    mocks.classifyReply.mockResolvedValue(classified('NEGATIVE'))
    mocks.tx.emailReply.create.mockRejectedValueOnce(new Error('db down'))
    const res = await POST(reply('Non merci'))
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(mocks.tx.lead.update).not.toHaveBeenCalled()
    expect(mocks.createNotification).not.toHaveBeenCalled()
  })
})
