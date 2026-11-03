import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  lead: null as Record<string, unknown> | null,
  touchesToday: 0,
  created: [] as Array<Record<string, unknown>>,
  leadUpdates: [] as Array<Record<string, unknown>>,
  chat: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    lead: {
      findFirst: vi.fn(async () => mocks.lead),
      update: vi.fn((args: Record<string, unknown>) => { mocks.leadUpdates.push(args); return args }),
    },
    leadTouch: {
      count: vi.fn(async () => mocks.touchesToday),
      create: vi.fn((args: { data: Record<string, unknown> }) => { mocks.created.push(args.data); return args }),
      findMany: vi.fn(async () => []),
    },
    workspace: { findUnique: vi.fn(async () => ({ name: 'Phantera', emailSignature: { enabled: true, fullName: 'Ayoub', company: 'Phantera' } })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))
vi.mock('@/lib/llm/client', () => ({ chat: mocks.chat, isLlmConfigured: () => true }))

import { formatPhone, normalizePhone, smsLink, whatsappLink } from '@/lib/phone/phone'
import { cleanDraft, finalizeDraft, SMS_OPT_OUT, TOUCH_MAX_LENGTH } from './draft'
import { DAILY_TOUCH_LIMIT, draftTouch, recordTouch } from './touch.service'
const OWNER = { workspaceId: 'w1', userId: 'u1', role: 'OWNER' as const }

const baseLead = {
  id: 'l1', firstName: 'Camille', lastName: 'Martin', company: 'Acme', title: 'CEO', industry: null,
  phone: '33612345678', doNotContact: false, status: 'new', campaignId: 'c1',
  campaign: { valueProposition: 'Sourcing IT en 48 h' },
  emailSends: [{ emailStep: { subject: 'Une question pour {{company}}' } }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lead = { ...baseLead }
  mocks.touchesToday = 0
  mocks.created.length = 0
  mocks.leadUpdates.length = 0
})

describe('phone numbers', () => {
  it('keeps international numbers only', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('33612345678')
    expect(normalizePhone('0033 6 12 34 56 78')).toBe('33612345678')
    expect(normalizePhone('06 12 34 56 78')).toBeNull()
    expect(normalizePhone('+33 6 12 AB')).toBeNull()
    expect(formatPhone('33612345678')).toBe('+33 6 12 34 56 78')
  })

  it('builds links that open the phone app with the message', () => {
    expect(whatsappLink('33612345678', 'Bonjour & merci')).toBe('https://wa.me/33612345678?text=Bonjour%20%26%20merci')
    expect(smsLink('33612345678', 'Bonjour')).toBe('sms:+33612345678?&body=Bonjour')
  })
})

describe('drafts', () => {
  it('always ends an SMS with the STOP line and fits two segments', () => {
    const sms = finalizeDraft('SMS', 'mot '.repeat(200))
    expect(sms.endsWith(SMS_OPT_OUT)).toBe(true)
    expect(sms.length).toBeLessThanOrEqual(TOUCH_MAX_LENGTH.SMS)
  })

  it('removes quotes and links the model may add', () => {
    expect(cleanDraft('« Bonjour, voir https://x.fr »')).toBe('Bonjour, voir')
  })

  it('drafts with the offer and the rendered email subject', async () => {
    mocks.chat.mockResolvedValue('Bonjour Camille, Ayoub de Phantera. Est-ce un sujet ?')
    const res = await draftTouch(OWNER, 'l1', 'WHATSAPP')
    expect(res).toMatchObject({ ok: true, remainingToday: DAILY_TOUCH_LIMIT })
    const prompt = String((mocks.chat.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt)
    expect(prompt).toContain('Sourcing IT en 48 h')
    expect(prompt).toContain('Une question pour Acme')
  })

  it('falls back to a template when the model fails', async () => {
    mocks.chat.mockRejectedValue(new Error('down'))
    const res = await draftTouch(OWNER, 'l1', 'SMS')
    expect(res.ok && res.body).toContain('Bonjour Camille, Ayoub de Phantera.')
  })
})

describe('guards', () => {
  it('refuses a lead marked "ne plus contacter", without a phone, or past the daily volume', async () => {
    mocks.lead = { ...baseLead, doNotContact: true }
    expect(await draftTouch(OWNER, 'l1', 'SMS')).toEqual({ ok: false, error: 'DO_NOT_CONTACT' })
    mocks.lead = { ...baseLead, phone: null }
    expect(await recordTouch(OWNER, 'l1', 'SMS', 'Bonjour')).toEqual({ ok: false, error: 'NO_PHONE' })
    mocks.lead = { ...baseLead }
    mocks.touchesToday = DAILY_TOUCH_LIMIT
    expect(await draftTouch(OWNER, 'l1', 'SMS')).toEqual({ ok: false, error: 'DAILY_LIMIT' })
    expect(mocks.created).toHaveLength(0)
  })

  it('records a send and marks a new lead contacted', async () => {
    const res = await recordTouch(OWNER, 'l1', 'WHATSAPP', '  Bonjour Camille  ')
    expect(res).toMatchObject({ ok: true, link: 'https://wa.me/33612345678?text=Bonjour%20Camille' })
    expect(mocks.created[0]).toMatchObject({ workspaceId: 'w1', leadId: 'l1', channel: 'WHATSAPP', body: 'Bonjour Camille' })
    expect(mocks.leadUpdates[0]).toMatchObject({ data: { status: 'contacted' } })
  })

  it('refuses an SMS longer than two segments', async () => {
    expect(await recordTouch(OWNER, 'l1', 'SMS', 'x'.repeat(TOUCH_MAX_LENGTH.SMS + 1))).toEqual({ ok: false, error: 'TOO_LONG' })
  })
})
