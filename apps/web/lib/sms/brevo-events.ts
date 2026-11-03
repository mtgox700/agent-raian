/**
 * Events Brevo reports on an automatic SMS (the per-message webUrl).
 *
 * Brevo's SMS payload is not documented field by field, so it is read
 * defensively: the message id, the recipient and the event name are looked
 * up under the keys Brevo uses across its webhooks. What matters most is the
 * STOP: every lead of the workspace with that number is then marked "Ne plus
 * contacter", which stops every channel.
 */

import type { PrismaClient } from '@prisma/client'
import { normalizePhone } from '@/lib/phone/phone'

export type SmsEventKind = 'OPT_OUT' | 'DELIVERED' | 'BOUNCED' | 'OTHER'

export interface SmsEvent {
  messageId: string | null
  recipient: string | null
  kind: SmsEventKind
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

export function readSmsEvent(payload: unknown): SmsEvent | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const obj = payload as Record<string, unknown>
  const messageId = pickString(obj, ['messageId', 'message_id', 'message-id', 'id'])
  const rawRecipient = pickString(obj, ['to', 'recipient', 'number', 'phone'])
  const recipient = rawRecipient ? normalizePhone(`+${rawRecipient.replace(/^\+/, '')}`) : null
  const name = (pickString(obj, ['msg_status', 'event', 'status', 'type']) ?? '').toLowerCase()
  const reply = pickString(obj, ['reply', 'reply_text', 'text', 'content'])

  const repliedStop = /repl/.test(name) && reply !== null && /^\s*stop\b/i.test(reply)
  let kind: SmsEventKind = 'OTHER'
  if (/unsub|stop|blacklist|opt.?out/.test(name) || repliedStop) kind = 'OPT_OUT'
  else if (/hard.?bounce|invalid/.test(name)) kind = 'BOUNCED'
  else if (/deliver/.test(name)) kind = 'DELIVERED'
  return { messageId, recipient, kind }
}

/** Every lead of the workspace with this number: never contacted again. */
export async function optOutPhone(db: Pick<PrismaClient, 'lead'>, workspaceId: string, digits: string): Promise<number> {
  const res = await db.lead.updateMany({ where: { workspaceId, phone: digits }, data: { doNotContact: true } })
  return res.count
}

export type SmsEventOutcome = 'IGNORED' | 'UNKNOWN_MESSAGE' | 'OPTED_OUT' | 'DELIVERED' | 'BOUNCED'

/** Applies one event to the send of this workspace it belongs to. */
export async function applySmsEvent(db: PrismaClient, workspaceId: string, event: SmsEvent): Promise<SmsEventOutcome> {
  if (event.kind === 'OTHER') return 'IGNORED'
  const send = event.messageId
    ? await db.emailSend.findFirst({
        where:  { providerMessageId: `brevo-sms:${event.messageId}`, campaign: { workspaceId } },
        select: { id: true, leadId: true, status: true, lead: { select: { phone: true } } },
      })
    : null

  if (event.kind === 'OPT_OUT') {
    const phone = send?.lead.phone ?? event.recipient
    if (send) await db.lead.update({ where: { id: send.leadId }, data: { doNotContact: true } })
    if (phone) await optOutPhone(db, workspaceId, phone)
    if (!send && !phone) {
      console.warn(`[webhooks/brevo-sms] STOP without a known message or number, workspace=${workspaceId}`)
      return 'UNKNOWN_MESSAGE'
    }
    return 'OPTED_OUT'
  }

  if (!send) return 'UNKNOWN_MESSAGE'
  if (event.kind === 'BOUNCED') {
    await db.emailSend.update({ where: { id: send.id }, data: { status: 'BOUNCED', errorMessage: 'Numéro injoignable' } })
    return 'BOUNCED'
  }
  if (send.status === 'SENT') {
    await db.emailSend.update({ where: { id: send.id }, data: { status: 'DELIVERED' } })
  }
  return 'DELIVERED'
}
