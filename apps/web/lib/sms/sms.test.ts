import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { automaticSmsContent, BREVO_STOP_MENTION, sendBrevoSms } from './brevo'
import { applySmsEvent, readSmsEvent } from './brevo-events'
import {
  activeSmsSettings,
  publicSmsSettings,
  smsSettingsInputSchema,
  smsWebhookUrl,
  toStoredSmsSettings,
  verifySmsWebhookToken,
} from './settings'
import { sendAutomaticSms } from '@/lib/sequences/send-sms'
import { SMS_OPT_OUT } from '@/lib/touch/channels'

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://www.phantera-tn.com')
})

describe('settings', () => {
  it('stores the Brevo key encrypted and never shows it back', () => {
    const stored = toStoredSmsSettings({ enabled: true, sender: 'Phantera', apiKey: 'xkeysib-secret' })
    expect(JSON.stringify(stored)).not.toContain('xkeysib-secret')
    expect(activeSmsSettings(stored)).toEqual({ sender: 'Phantera', apiKey: 'xkeysib-secret' })
    expect(publicSmsSettings(stored)).toEqual({ enabled: true, sender: 'Phantera', hasApiKey: true })
    expect(activeSmsSettings({ ...stored, enabled: false })).toBeNull()
    expect(activeSmsSettings(null)).toBeNull()
  })

  it('accepts only sender names operators deliver', () => {
    const ok = (sender: string) => smsSettingsInputSchema.safeParse({ enabled: true, sender }).success
    expect(ok('Phantera')).toBe(true)
    expect(ok('Spar X')).toBe(false)
    expect(ok('Éclair')).toBe(false)
    expect(ok('TwelveChars1')).toBe(false)
    expect(ok('12345')).toBe(false)
    expect(ok('INFO')).toBe(false)
  })

  it('signs the status webhook per workspace', () => {
    const url = new URL(smsWebhookUrl('w1')!)
    expect(url.pathname).toBe('/api/webhooks/brevo-sms')
    expect(verifySmsWebhookToken('w1', url.searchParams.get('t')!)).toBe(true)
    expect(verifySmsWebhookToken('w2', url.searchParams.get('t')!)).toBe(false)
    expect(verifySmsWebhookToken('w1', 'forged')).toBe(false)
  })
})

describe('message', () => {
  it('replaces the "reply STOP" line with Brevo’s STOP short code and keeps the length budget', () => {
    const content = automaticSmsContent(`Camille, Ayoub de Phantera : avez-vous vu mon e-mail ? ${SMS_OPT_OUT}`)
    expect(content).toBe(`Camille, Ayoub de Phantera : avez-vous vu mon e-mail ? ${BREVO_STOP_MENTION}`)
    const long = automaticSmsContent('x'.repeat(500))
    expect(long.length).toBeLessThanOrEqual(300)
    expect(long.endsWith(BREVO_STOP_MENTION)).toBe(true)
  })

  it('sends a marketing SMS (Brevo then holds nights, Sundays, holidays)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messageId: 991 }), { status: 201 }))
    const res = await sendBrevoSms({ apiKey: 'k', sender: 'Phantera', recipientDigits: '33612345678', content: 'Bonjour STOP au [STOP_CODE]', webUrl: null, tag: 't' }, fetchImpl)
    expect(res).toEqual({ ok: true, messageId: '991' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/transactionalSMS/send')
    expect(JSON.parse(String(init.body))).toMatchObject({ type: 'marketing', sender: 'Phantera', recipient: '33612345678' })
    expect((init.headers as Record<string, string>)['api-key']).toBe('k')
  })

  it('classifies Brevo refusals', async () => {
    const reply = (status: number, body: object) => vi.fn(async () => new Response(JSON.stringify(body), { status }))
    const send = (f: typeof fetch) => sendBrevoSms({ apiKey: 'k', sender: 'P1', recipientDigits: '336', content: 'x', webUrl: null, tag: 't' }, f)
    expect(await send(reply(401, { code: 'unauthorized' }))).toMatchObject({ ok: false, error: 'AUTH' })
    expect(await send(reply(400, { code: 'not_enough_credits' }))).toMatchObject({ ok: false, error: 'NO_CREDITS' })
    expect(await send(reply(400, { message: 'Recipient is blacklisted' }))).toMatchObject({ ok: false, error: 'RECIPIENT_OPTED_OUT' })
    expect(await send(reply(400, { message: 'Recipient blocked' }))).toMatchObject({ ok: false, error: 'RECIPIENT_OPTED_OUT' })
    expect(await send(reply(400, { message: 'Contact blacklisted' }))).toMatchObject({ ok: false, error: 'RECIPIENT_OPTED_OUT' })
    expect(await send(reply(400, { message: 'Your account is blocked' }))).toMatchObject({ ok: false, error: 'ACCOUNT' })
    expect(await send(reply(400, { message: 'Sender blocked by operator' }))).toMatchObject({ ok: false, error: 'ACCOUNT' })
    expect(await send(reply(400, { code: 'invalid_parameter' }))).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await send(reply(429, {}))).toMatchObject({ ok: false, error: 'RATE_LIMITED' })
    expect(await send(reply(502, {}))).toMatchObject({ ok: false, error: 'UNKNOWN' })
    const reset = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await send(reset)).toMatchObject({ ok: false, error: 'UNKNOWN' })
  })
})

describe('automatic SMS step', () => {
  function fakeDb() {
    const ops: string[] = []
    const db = {
      emailSend: { update: vi.fn(async ({ data }: { data: { status?: string } }) => { ops.push(`send:${data.status}`); return {} }) },
      lead: {
        update: vi.fn(async ({ data }: { data: object }) => { ops.push(`lead:${JSON.stringify(data)}`); return {} }),
        updateMany: vi.fn(async ({ where, data }: { where: object; data: object }) => { ops.push(`leads:${JSON.stringify(where)}:${JSON.stringify(data)}`); return { count: 2 } }),
      },
      leadTouch: { create: vi.fn(async () => { ops.push('touch:TODO'); return {} }) },
      $transaction: vi.fn(async (list: Promise<unknown>[]) => Promise.all(list)),
    }
    return { db: db as unknown as PrismaClient, ops }
  }
  const input = (smsSettings: unknown) => ({
    sendId: 's1', workspaceId: 'w1', campaignId: 'c1', leadId: 'l1', phone: '33612345678',
    message: `Camille, Ayoub de Phantera : un mot ? ${SMS_OPT_OUT}`, smsSettings,
  })
  const enabled = () => toStoredSmsSettings({ enabled: true, sender: 'Phantera', apiKey: 'k' })

  it('is not used when the workspace has no Brevo account (the step goes to "À envoyer")', async () => {
    const { db } = fakeDb()
    expect(await sendAutomaticSms(db, input(null), async () => undefined, vi.fn())).toBeNull()
  })

  it('sends, records the step as sent and counts it', async () => {
    const { db, ops } = fakeDb()
    const onSent = vi.fn(async () => undefined)
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messageId: 7 }), { status: 201 }))
    expect(await sendAutomaticSms(db, input(enabled()), onSent, fetchImpl)).toEqual({ status: 'sent', sendId: 's1', resendMessageId: '7' })
    expect(ops).toEqual(['send:SENDING', 'send:SENT'])
    expect(onSent).toHaveBeenCalledOnce()
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.content.endsWith(BREVO_STOP_MENTION)).toBe(true)
    expect(body.content).not.toContain(SMS_OPT_OUT)
    expect(new URL(body.webUrl).pathname).toBe('/api/webhooks/brevo-sms')
  })

  it('a number that answered STOP is never contacted again, on any channel', async () => {
    const { db, ops } = fakeDb()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: 'blacklisted' }), { status: 400 }))
    expect(await sendAutomaticSms(db, input(enabled()), async () => undefined, fetchImpl)).toEqual({ status: 'skipped', reason: 'DNC' })
    expect(ops).toContain('leads:{"workspaceId":"w1","phone":"33612345678"}:{"doNotContact":true}')
  })

  it('a suspended account never marks leads "do not contact"', async () => {
    const { db, ops } = fakeDb()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: 'account blocked' }), { status: 400 }))
    expect(await sendAutomaticSms(db, input(enabled()), async () => undefined, fetchImpl)).toEqual({ status: 'skipped', reason: 'AWAITING_USER' })
    expect(ops.some((o) => o.includes('doNotContact'))).toBe(false)
  })

  it('a server error or a failed write after Brevo’s yes never leads to a second SMS', async () => {
    const down = fakeDb()
    const fetch5xx = vi.fn(async () => new Response('{}', { status: 503 }))
    expect((await sendAutomaticSms(down.db, input(enabled()), async () => undefined, fetch5xx))?.status).toBe('error')
    expect(down.ops).toEqual(['send:SENDING'])

    const { db, ops } = fakeDb()
    const update = (db as unknown as { emailSend: { update: ReturnType<typeof vi.fn> } }).emailSend.update
    update.mockImplementationOnce(async () => { ops.push('send:SENDING'); return {} })
    update.mockImplementationOnce(async () => { throw new Error('connection lost') })
    const onSent = vi.fn(async () => undefined)
    const ok = vi.fn(async () => new Response(JSON.stringify({ messageId: 8 }), { status: 201 }))
    expect((await sendAutomaticSms(db, input(enabled()), onSent, ok))?.status).toBe('error')
    expect(ops).toEqual(['send:SENDING'])
    expect(onSent).not.toHaveBeenCalled()
  })

  it('a refusal (invalid message, volume) is retried within the attempt budget', async () => {
    const { db, ops } = fakeDb()
    const refused = vi.fn(async () => new Response(JSON.stringify({ code: 'invalid_parameter' }), { status: 400 }))
    expect((await sendAutomaticSms(db, input(enabled()), async () => undefined, refused))?.status).toBe('error')
    expect(ops).toEqual(['send:SENDING', 'send:FAILED'])
  })

  it('without credits, the message falls back to the user’s queue', async () => {
    const { db, ops } = fakeDb()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 'not_enough_credits' }), { status: 400 }))
    expect(await sendAutomaticSms(db, input(enabled()), async () => undefined, fetchImpl)).toEqual({ status: 'skipped', reason: 'AWAITING_USER' })
    expect(ops).toEqual(['send:SENDING', 'send:AWAITING_USER', 'touch:TODO'])
  })

  it('an unanswered call is never resent (no duplicate SMS)', async () => {
    const { db, ops } = fakeDb()
    const fetchImpl = vi.fn(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }) })
    const res = await sendAutomaticSms(db, input(enabled()), async () => undefined, fetchImpl)
    expect(res?.status).toBe('error')
    expect(ops).toEqual(['send:SENDING'])
  })
})

describe('Brevo events', () => {
  it('reads STOP, delivery and bounce events', () => {
    expect(readSmsEvent({ messageId: 7, msg_status: 'unsubscribed' })).toMatchObject({ messageId: '7', kind: 'OPT_OUT' })
    expect(readSmsEvent({ messageId: 7, event: 'reply', reply: 'Stop' })).toMatchObject({ kind: 'OPT_OUT' })
    expect(readSmsEvent({ messageId: 7, event: 'reply', reply: 'Oui volontiers' })).toMatchObject({ kind: 'OTHER' })
    expect(readSmsEvent({ messageId: 7, msg_status: 'delivered' })).toMatchObject({ kind: 'DELIVERED' })
    expect(readSmsEvent({ messageId: 7, msg_status: 'hard_bounce' })).toMatchObject({ kind: 'BOUNCED' })
    expect(readSmsEvent('nope')).toBeNull()
  })

  it('opts out every lead of the workspace with that number, only for a message of this workspace', async () => {
    const leadUpdate = vi.fn(async () => ({}))
    const leadUpdateMany = vi.fn(async () => ({ count: 2 }))
    const findFirst = vi.fn(async ({ where }: { where: { campaign: { workspaceId: string } } }) =>
      where.campaign.workspaceId === 'w1' ? { id: 's1', leadId: 'l1', status: 'SENT', lead: { phone: '33612345678' } } : null)
    const db = { emailSend: { findFirst, update: vi.fn() }, lead: { update: leadUpdate, updateMany: leadUpdateMany } } as unknown as PrismaClient

    expect(await applySmsEvent(db, 'w2', { messageId: '7', recipient: null, kind: 'OPT_OUT' })).toBe('UNKNOWN_MESSAGE')
    expect(leadUpdate).not.toHaveBeenCalled()
    expect(leadUpdateMany).not.toHaveBeenCalled()

    expect(await applySmsEvent(db, 'w1', { messageId: '7', recipient: null, kind: 'OPT_OUT' })).toBe('OPTED_OUT')
    expect(leadUpdate).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { doNotContact: true } })
    expect(leadUpdateMany).toHaveBeenCalledWith({ where: { workspaceId: 'w1', phone: '33612345678' }, data: { doNotContact: true } })
    expect(findFirst.mock.calls[0][0]).toMatchObject({ where: { providerMessageId: 'brevo-sms:7' } })
  })

  it('a STOP whose message is unknown still blocks the number it came from', async () => {
    const leadUpdateMany = vi.fn(async () => ({ count: 1 }))
    const db = { emailSend: { findFirst: vi.fn(async () => null) }, lead: { update: vi.fn(), updateMany: leadUpdateMany } } as unknown as PrismaClient
    const event = readSmsEvent({ msg_status: 'unsubscribed', to: '+33 6 12 34 56 78' })!
    expect(event.recipient).toBe('33612345678')
    expect(await applySmsEvent(db, 'w1', event)).toBe('OPTED_OUT')
    expect(leadUpdateMany).toHaveBeenCalledWith({ where: { workspaceId: 'w1', phone: '33612345678' }, data: { doNotContact: true } })
  })
})
