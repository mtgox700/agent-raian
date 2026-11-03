/**
 * Delivery failure notices (bounces) that land in a connected mailbox.
 *
 * Resend reports bounces by webhook; Gmail, Outlook and SMTP mailboxes get a
 * notice in their inbox instead. Without reading it, follow-ups kept going to
 * dead addresses, which is exactly what burns a sender domain.
 *
 * The rules are deliberately strict: a human reply mistaken for a bounce
 * would be dropped, and a wrong address would be suppressed.
 */

const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon)@/i
const BOUNCE_SUBJECT = /(delivery status notification \((failure|delay)\)|undeliver(able|ed)|non remis|mail delivery (failed|failure)|returned mail|delivery (has )?failed|echec de (la )?remise|message non distribue)/i

/** Only text this long is inspected: notices are short, and it bounds regex work. */
const MAX_INSPECTED_CHARS = 10_000

/** A delivery failure notice: sent by a mail system AND titled like one. */
export function isBounceMessage(fromEmail: string, subject: string): boolean {
  const normalizedSubject = subject.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return BOUNCE_SENDER.test(fromEmail.trim()) && BOUNCE_SUBJECT.test(normalizedSubject)
}

const ADDRESS = '[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\\.[A-Za-z]{2,24}'
const RECIPIENT_PATTERNS = [
  new RegExp(`Final-Recipient:\\s*rfc822;\\s*<?(${ADDRESS})>?`, 'i'),
  new RegExp(`Original-Recipient:\\s*rfc822;\\s*<?(${ADDRESS})>?`, 'i'),
  new RegExp(`wasn'?t delivered to\\s+<?(${ADDRESS})>?`, 'i'),
  new RegExp(`delivery has failed to these recipients or groups:\\s*<?(${ADDRESS})>?`, 'i'),
]

const PERMANENT = /(Status:\s*5\.\d{1,3}\.\d{1,3}|\b55[0-4][ -]5\.\d|user unknown|address not found|couldn'?t be found|does not exist|no such user|n'existe pas|adresse introuvable|mailbox unavailable)/i
const TEMPORARY = /(Status:\s*4\.\d{1,3}\.\d{1,3}|\b45[0-2][ -]4\.\d|mailbox full|over quota|delayed|temporar)/i

export interface ParsedBounce {
  recipient: string | null
  permanent: boolean
}

/**
 * The address that failed and whether the failure is permanent (hard bounce).
 * Only addresses named by the notice's structured or standard wording count;
 * an address merely quoted in the body never does.
 */
export function parseBounce(body: string, senderEmail: string): ParsedBounce {
  const text = body.slice(0, MAX_INSPECTED_CHARS)
  const sender = senderEmail.trim().toLowerCase()
  let recipient: string | null = null
  for (const pattern of RECIPIENT_PATTERNS) {
    const found = pattern.exec(text)?.[1]?.replace(/[.,;]+$/, '').toLowerCase()
    if (found && found !== sender) { recipient = found; break }
  }
  const permanent = PERMANENT.test(text) && !TEMPORARY.test(text)
  return { recipient, permanent }
}
