/**
 * Brevo SMS API (https://api.brevo.com/v3), called with the workspace's own key.
 */

import { SMS_OPT_OUT, TOUCH_MAX_LENGTH } from '@/lib/touch/channels'

const BREVO_API = 'https://api.brevo.com/v3'
const TIMEOUT_MS = 10_000

/** Brevo replaces the placeholder with its short code and handles the STOP itself. */
export const BREVO_STOP_MENTION = 'STOP au [STOP_CODE]'

/**
 * AUTH, NO_CREDITS, ACCOUNT: the account cannot send (key, credits, account
 * or sender suspended). RECIPIENT_OPTED_OUT: this number said STOP to the
 * account. INVALID: Brevo refused this message, nothing was sent.
 * RATE_LIMITED: refused for volume, nothing was sent. UNKNOWN: no clear
 * answer (network, timeout, 5xx): Brevo may have taken it, never resend.
 */
export type BrevoSmsError = 'AUTH' | 'NO_CREDITS' | 'ACCOUNT' | 'RECIPIENT_OPTED_OUT' | 'INVALID' | 'RATE_LIMITED' | 'UNKNOWN'

export type BrevoSendResult = { ok: true; messageId: string } | { ok: false; error: BrevoSmsError; detail: string }

/**
 * The message as sent automatically: the "reply STOP" line of a hand-sent SMS
 * becomes Brevo's STOP short code (an alphanumeric sender cannot receive a
 * reply), and the whole fits the SMS length budget.
 */
export function automaticSmsContent(text: string): string {
  const body = text.replace(SMS_OPT_OUT, '').replace(/\s+/g, ' ').trim()
  const room = TOUCH_MAX_LENGTH.SMS - BREVO_STOP_MENTION.length - 1
  const cut = body.length > room ? `${body.slice(0, room - 1).trimEnd()}…` : body
  return `${cut} ${BREVO_STOP_MENTION}`
}

export function classifyBrevoError(status: number, body: { code?: string; message?: string }): BrevoSmsError {
  const text = `${body.code ?? ''} ${body.message ?? ''}`.toLowerCase()
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 500 || status < 400) return 'UNKNOWN'
  if (status === 401 || status === 403 || text.includes('unauthorized')) return 'AUTH'
  if (text.includes('credit')) return 'NO_CREDITS'
  // Only a refusal about the recipient opts the lead out; an account or
  // sender suspension must never mark leads "do not contact".
  const aboutAccount = /account|sender|suspend/.test(text)
  if (!aboutAccount && /blacklist|unsubscribed|opted.?out|(recipient|contact|number|phone).*blocked/.test(text)) return 'RECIPIENT_OPTED_OUT'
  if (aboutAccount || text.includes('blocked')) return 'ACCOUNT'
  return 'INVALID'
}

export async function sendBrevoSms(
  input: { apiKey: string; sender: string; recipientDigits: string; content: string; webUrl: string | null; tag: string },
  fetchImpl: typeof fetch = fetch,
): Promise<BrevoSendResult> {
  try {
    const res = await fetchImpl(`${BREVO_API}/transactionalSMS/send`, {
      method:  'POST',
      headers: { 'api-key': input.apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body:    JSON.stringify({
        type:           'marketing',
        sender:         input.sender,
        recipient:      input.recipientDigits,
        content:        input.content,
        tag:            input.tag,
        unicodeEnabled: /[^ -~\n]/.test(input.content),
        ...(input.webUrl ? { webUrl: input.webUrl } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = await res.json().catch(() => ({})) as { messageId?: number | string; code?: string; message?: string }
    if (res.ok && body.messageId !== undefined) return { ok: true, messageId: String(body.messageId) }
    return { ok: false, error: classifyBrevoError(res.status, body), detail: `HTTP ${res.status} ${body.code ?? ''}`.trim() }
  } catch (err) {
    // The request may have reached Brevo before the connection dropped.
    return { ok: false, error: 'UNKNOWN', detail: err instanceof Error ? err.name : 'network' }
  }
}

/** Checks a key and returns the SMS credits left on the account (null if unknown). */
export async function checkBrevoAccount(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; smsCredits: number | null } | { ok: false; error: BrevoSmsError }> {
  try {
    const res = await fetchImpl(`${BREVO_API}/account`, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'AUTH' }
    if (!res.ok) return { ok: false, error: 'UNKNOWN' }
    const body = await res.json().catch(() => ({})) as { plan?: Array<{ type?: string; credits?: number }> }
    const sms = body.plan?.find((p) => p.type === 'sms')
    return { ok: true, smsCredits: typeof sms?.credits === 'number' ? sms.credits : null }
  } catch {
    return { ok: false, error: 'UNKNOWN' }
  }
}
