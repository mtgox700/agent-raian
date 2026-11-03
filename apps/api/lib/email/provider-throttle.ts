/**
 * Recognises a provider refusing to send because of volume (quota or rate
 * limit), as opposed to a problem with this one email.
 *
 * A throttled mailbox is paused instead of failing the send: the email stays
 * queued, no retry attempt is consumed, and sending resumes on its own once
 * the pause ends. Hammering a provider that already said "slow down" is how
 * an account gets suspended.
 */

const MINUTE_MS = 60 * 1000

/** Daily sending limit of the account reached (Gmail, Outlook, SMTP hosts). */
const DAILY_LIMIT_PATTERNS = [
  /daily user sending limit/i,
  /daily sending quota/i,
  /sending limit exceeded/i,
  /ErrorExceededMessageLimit/i,
  /\b5\.4\.5\b/,
  /quota exceeded/i,
  /dailyLimitExceeded/i,
]

/** Too many messages too fast: back off for a few minutes. */
// Per-recipient temporary codes (450/451 greylisting, 452 4.2.2 mailbox
// full) are deliberately absent: one prospect's full inbox must not pause the
// sender's whole mailbox.
const RATE_LIMIT_PATTERNS = [
  /\(429\)/,
  /\b429 too many/i,
  /status(?:code)?\W{0,3}429\b/i,
  /rate ?limit/i,
  /userRateLimitExceeded/i,
  /too many (messages|requests|connections|emails)/i,
  /ApplicationThrottled/i,
  /MailboxConcurrency/i,
  /\b421[ -]4\.7\.\d\b/,
]

export interface ThrottleVerdict {
  kind: 'daily' | 'rate'
  pauseMs: number
}

export const DAILY_LIMIT_PAUSE_MS = 6 * 60 * MINUTE_MS
export const RATE_LIMIT_PAUSE_MS = 15 * MINUTE_MS

export function classifyProviderThrottle(message: string): ThrottleVerdict | null {
  const text = message.slice(0, 1000)
  if (DAILY_LIMIT_PATTERNS.some((p) => p.test(text))) {
    return { kind: 'daily', pauseMs: DAILY_LIMIT_PAUSE_MS }
  }
  if (RATE_LIMIT_PATTERNS.some((p) => p.test(text))) {
    return { kind: 'rate', pauseMs: RATE_LIMIT_PAUSE_MS }
  }
  return null
}
