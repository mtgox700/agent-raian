/**
 * Who a campaign email is sent as: a connected mailbox, optionally one of its
 * aliases.
 *
 * An alias is another address the same account may send as. It shares the
 * mailbox's daily cap and reputation (providers count sends per account,
 * not per address), so it changes how the email is presented, not how many
 * can go out. Replies come back to the same mailbox, where Phantera reads them.
 *
 * - Gmail: only the « Envoyer en tant que » addresses Google marks as
 *   verified, read with the gmail.readonly scope already granted.
 * - SMTP: addresses of the mailbox's own domain, entered by the user; the
 *   server decides whether it accepts them, and another domain is refused
 *   here so a mailbox can never be used to impersonate a foreign address.
 * - Outlook: no alias (sending as another address needs a right granted by
 *   the tenant administrator).
 */

import { z } from 'zod'

export const MAX_ALIASES = 20
const MAX_EMAIL_LENGTH = 254
const MAX_DISPLAY_NAME = 80
const EMAIL_PATTERN = /^[^\s@<>()",;:\\[\]]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

export type AliasSource = 'GMAIL' | 'MANUAL'

export interface MailboxAlias {
  email: string
  displayName: string | null
  source: AliasSource
}

/** Lowercased, trimmed address, or null when it is not a plain address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null
  return EMAIL_PATTERN.test(email) ? email : null
}

/** A display name safe for a From header: no line breaks, no angle brackets or quotes. */
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/[\r\n\t<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_DISPLAY_NAME)
  return name.length > 0 ? name : null
}

const storedAliasSchema = z.object({
  email: z.string(),
  displayName: z.string().nullable().optional(),
  source: z.enum(['GMAIL', 'MANUAL']),
})

/** Aliases stored on a mailbox; anything malformed is dropped, never trusted. */
export function parseAliases(raw: unknown): MailboxAlias[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const aliases: MailboxAlias[] = []
  for (const item of raw.slice(0, MAX_ALIASES)) {
    const parsed = storedAliasSchema.safeParse(item)
    if (!parsed.success) continue
    const email = normalizeEmail(parsed.data.email)
    if (!email || seen.has(email)) continue
    seen.add(email)
    aliases.push({ email, displayName: cleanDisplayName(parsed.data.displayName), source: parsed.data.source })
  }
  return aliases
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1)
}

/**
 * Public mail domains: everyone has an address there, so « same domain » says
 * nothing about who owns the alias. No SMTP alias is accepted on them.
 */
const SHARED_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr',
  'msn.com', 'yahoo.com', 'yahoo.fr', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.fr',
  'gmx.com', 'gmx.fr', 'gmx.de', 'gmx.net', 'mail.com', 'proton.me', 'protonmail.com', 'pm.me', 'zoho.com',
  'yandex.com', 'yandex.ru', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'neuf.fr', 'laposte.net', 'bbox.fr',
  'numericable.fr', 'aliceadsl.fr', 'club-internet.fr', 'web.de', 'tutanota.com', 'fastmail.com',
])

export function isSharedMailDomain(domain: string): boolean {
  return SHARED_MAIL_DOMAINS.has(domain.toLowerCase())
}

/**
 * An SMTP alias must be a different address of the mailbox's own domain, and
 * that domain must belong to the user (not a public mail provider).
 */
export function smtpAliasAllowed(mailboxEmail: string, alias: string): boolean {
  const box = normalizeEmail(mailboxEmail)
  const candidate = normalizeEmail(alias)
  if (!box || !candidate || box === candidate) return false
  const domain = emailDomain(box)
  return domain === emailDomain(candidate) && !isSharedMailDomain(domain)
}

export function providerSupportsAliases(provider: string): boolean {
  return provider === 'GMAIL' || provider === 'SMTP'
}

interface SenderMailbox {
  email: string
  displayName: string | null
  provider: string
  sendAsAliases?: unknown
}

export interface SenderAddress {
  email: string
  name: string | null
  /** False when the requested alias is no longer usable and the mailbox address is used instead. */
  asRequested: boolean
}

/**
 * The From address for a send. An alias is used only while it is still one
 * of the mailbox's aliases; otherwise the mailbox's own address is used, which
 * is always the user's own identity.
 */
export function senderAddress(mailbox: SenderMailbox, fromAlias: string | null | undefined): SenderAddress {
  const wanted = normalizeEmail(fromAlias)
  if (wanted && providerSupportsAliases(mailbox.provider)) {
    const alias = parseAliases(mailbox.sendAsAliases).find((a) => a.email === wanted)
    if (alias) return { email: alias.email, name: alias.displayName ?? cleanDisplayName(mailbox.displayName), asRequested: true }
  }
  // Every name here ends up in a From header: cleaned whatever its source
  // (provider profile, user input).
  return { email: mailbox.email, name: cleanDisplayName(mailbox.displayName), asRequested: !wanted }
}

// ─── Gmail « Envoyer en tant que » ─────────────────────────────────────────────

const gmailSendAsSchema = z.object({
  sendAs: z.array(z.object({
    sendAsEmail: z.string(),
    displayName: z.string().optional(),
    isPrimary: z.boolean().optional(),
    verificationStatus: z.string().optional(),
  })).optional(),
})

const GMAIL_SEND_AS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs'
const GMAIL_TIMEOUT_MS = 10_000

export class GmailAliasError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/**
 * The verified send-as addresses of a Gmail account, primary excluded.
 * Gmail sends as an address only once it is verified, and keeps the primary
 * one otherwise, so unverified addresses are never offered.
 */
export async function fetchGmailAliases(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<MailboxAlias[]> {
  const res = await fetchImpl(GMAIL_SEND_AS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
  })
  if (!res.ok) throw new GmailAliasError(`Gmail sendAs ${res.status}`, res.status)
  const parsed = gmailSendAsSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new GmailAliasError('Gmail sendAs: unexpected response', 502)

  const aliases = (parsed.data.sendAs ?? [])
    .filter((entry) => !entry.isPrimary)
    .filter((entry) => (entry.verificationStatus ?? 'accepted') === 'accepted')
    .map((entry) => ({ email: entry.sendAsEmail, displayName: entry.displayName ?? null, source: 'GMAIL' as const }))
  return parseAliases(aliases)
}
