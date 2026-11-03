import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: null as Record<string, unknown> | null,
  updateMany: vi.fn(async () => ({ count: 1 })),
  createNotification: vi.fn(async () => ({})),
}))

vi.mock('@/lib/db', () => ({
  db: { emailSend: { findUnique: vi.fn(async () => mocks.send), updateMany: mocks.updateMany } },
}))
vi.mock('@/lib/services/notifications.service', () => ({ createNotification: mocks.createNotification }))
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientKey: () => 'ip' }))

import { GET } from './route'
import { renderSignatureHtml, signatureInputSchema, whatsappDigits } from '@/lib/email/signature'

const signature = { enabled: true, fullName: 'Ayoub', role: '', company: '', website: '', linkedinUrl: '', logoUrl: '', whatsapp: '+33 6 12 34 56 78', customHtml: '' }

function sendWith(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1', status: 'OPENED', sentAt: new Date(Date.now() - 60 * 60 * 1000), clickedAt: null,
    campaignId: 'c1', leadId: 'l1',
    lead: { firstName: 'Camille', lastName: 'Martin', company: 'Acme' },
    campaign: { name: 'ESN', workspaceId: 'w1', workspace: { emailSignature: signature } },
    ...overrides,
  }
}

const click = (sid = 's1') => GET(new Request(`https://x/api/track/whatsapp?sid=${sid}`))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.send = sendWith()
})

describe('WhatsApp click-to-chat link', () => {
  it('opens a chat with the sender, first message prefilled, and records the click', async () => {
    const res = await click()
    expect(res.status).toBe(302)
    const target = new URL(res.headers.get('location') ?? '')
    expect(target.origin + target.pathname).toBe('https://wa.me/33612345678')
    expect(target.searchParams.get('text')).toContain('Bonjour Ayoub')
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1', clickedAt: null },
      data: expect.objectContaining({ status: 'CLICKED' }),
    }))
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'LEAD_CLICKED_WHATSAPP', campaignId: 'c1' }))
  })

  it('ignores a mail scanner opening the link right after delivery', async () => {
    mocks.send = sendWith({ sentAt: new Date(Date.now() - 10 * 1000) })
    const res = await click()
    expect(res.status).toBe(302)
    expect(mocks.updateMany).not.toHaveBeenCalled()
    expect(mocks.createNotification).not.toHaveBeenCalled()
  })

  it('notifies once: a second click finds clickedAt already set', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 })
    await click()
    expect(mocks.createNotification).not.toHaveBeenCalled()
  })

  it('never redirects anywhere the URL chooses: unknown send or no number → site home', async () => {
    mocks.send = null
    expect(new URL((await click('nope')).headers.get('location') ?? '').hostname).not.toBe('wa.me')
    mocks.send = sendWith({ campaign: { name: 'ESN', workspaceId: 'w1', workspace: { emailSignature: { ...signature, whatsapp: '' } } } })
    expect(new URL((await click()).headers.get('location') ?? '').hostname).not.toBe('wa.me')
  })
})

describe('signature WhatsApp number', () => {
  it('requires the international form', () => {
    expect(whatsappDigits('+33 6 12 34 56 78')).toBe('33612345678')
    expect(whatsappDigits('0033612345678')).toBe('33612345678')
    expect(whatsappDigits('06 12 34 56 78')).toBeNull()
    expect(whatsappDigits('+33 6 12 AB')).toBeNull()
    expect(signatureInputSchema.safeParse({ ...signature, whatsapp: '0612345678' }).success).toBe(false)
  })

  it('puts the tracked link in the email signature', () => {
    const html = renderSignatureHtml(signature, { whatsappHref: 'https://www.phantera-tn.com/api/track/whatsapp?sid=s1' })
    expect(html).toContain('href="https://www.phantera-tn.com/api/track/whatsapp?sid=s1"')
    expect(html).toContain('>WhatsApp</a>')
    expect(renderSignatureHtml({ ...signature, whatsapp: '' })).not.toContain('WhatsApp')
  })
})
