/**
 * Storing the aliases of a mailbox: synced from Gmail, entered by hand for
 * SMTP. A campaign whose alias disappears goes back to the mailbox address,
 * the user's own identity, rather than keeping a sender that would fail.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { decrypt } from '@/lib/security/crypto'
import { ensureValidToken } from './gmail-client'
import {
  MAX_ALIASES,
  cleanDisplayName,
  emailDomain,
  fetchGmailAliases,
  isSharedMailDomain,
  normalizeEmail,
  parseAliases,
  smtpAliasAllowed,
  type MailboxAlias,
} from './sender-identity'

type Db = Pick<PrismaClient, 'connectedMailbox' | 'campaign'>

function toJson(aliases: MailboxAlias[]): Prisma.InputJsonValue {
  return aliases.map((a) => ({ email: a.email, displayName: a.displayName, source: a.source }))
}

/** Campaigns of this mailbox using an alias that is gone send as the mailbox again. */
async function releaseRemovedAliases(db: Db, mailboxId: string, kept: MailboxAlias[]): Promise<number> {
  const res = await db.campaign.updateMany({
    where: {
      connectedMailboxId: mailboxId,
      fromAlias: { not: null, notIn: kept.map((a) => a.email) },
    },
    data: { fromAlias: null },
  })
  return res.count
}

/**
 * Reads the verified « Envoyer en tant que » addresses of a Gmail mailbox and
 * stores them. The access token is refreshed when needed.
 */
export async function syncGmailAliases(db: Db, mailboxId: string, freshAccessToken?: string): Promise<MailboxAlias[]> {
  const mailbox = await db.connectedMailbox.findUnique({
    where: { id: mailboxId },
    select: { id: true, provider: true, status: true, accessTokenEnc: true, refreshTokenEnc: true, tokenExpiresAt: true },
  })
  if (!mailbox || mailbox.provider !== 'GMAIL') throw new Error('Not a Gmail mailbox')

  const token = freshAccessToken ?? await ensureValidToken(
    mailbox.id,
    decrypt(mailbox.accessTokenEnc),
    mailbox.refreshTokenEnc ? decrypt(mailbox.refreshTokenEnc) : null,
    mailbox.tokenExpiresAt,
  )
  const aliases = await fetchGmailAliases(token)
  await db.connectedMailbox.update({
    where: { id: mailbox.id },
    data: { sendAsAliases: toJson(aliases), aliasesSyncedAt: new Date() },
  })
  await releaseRemovedAliases(db, mailbox.id, aliases)
  return aliases
}

export type AliasEditResult =
  | { ok: true; aliases: MailboxAlias[]; releasedCampaigns: number }
  | { ok: false; status: number; error: string }

async function loadSmtpMailbox(db: Db, workspaceId: string, mailboxId: string) {
  return db.connectedMailbox.findFirst({
    where: { id: mailboxId, workspaceId },
    select: { id: true, email: true, provider: true, sendAsAliases: true },
  })
}

/** Adds an SMTP alias: a different address of the mailbox's own domain. */
export async function addSmtpAlias(
  db: Db,
  workspaceId: string,
  mailboxId: string,
  input: { email: string; displayName?: string | null },
): Promise<AliasEditResult> {
  const mailbox = await loadSmtpMailbox(db, workspaceId, mailboxId)
  if (!mailbox) return { ok: false, status: 404, error: 'Boîte introuvable.' }
  if (mailbox.provider !== 'SMTP') {
    return { ok: false, status: 400, error: 'Les alias se saisissent pour une boîte SMTP ; ceux de Gmail se synchronisent.' }
  }

  const email = normalizeEmail(input.email)
  if (!email) return { ok: false, status: 422, error: 'Adresse invalide.' }
  if (isSharedMailDomain(emailDomain(mailbox.email.toLowerCase()))) {
    return { ok: false, status: 422, error: `Pas d’alias sur une adresse ${emailDomain(mailbox.email.toLowerCase())} : il faut une boîte sur votre propre domaine.` }
  }
  if (!smtpAliasAllowed(mailbox.email, email)) {
    return { ok: false, status: 422, error: `L’alias doit être une autre adresse du domaine de ${mailbox.email}.` }
  }

  const current = parseAliases(mailbox.sendAsAliases)
  if (current.some((a) => a.email === email)) return { ok: false, status: 409, error: 'Cet alias existe déjà.' }
  if (current.length >= MAX_ALIASES) return { ok: false, status: 422, error: `${MAX_ALIASES} alias au plus par boîte.` }

  const aliases = [...current, { email, displayName: cleanDisplayName(input.displayName), source: 'MANUAL' as const }]
  await db.connectedMailbox.update({ where: { id: mailbox.id }, data: { sendAsAliases: toJson(aliases) } })
  return { ok: true, aliases, releasedCampaigns: 0 }
}

/** Removes an alias the user entered; campaigns using it send as the mailbox again. */
export async function removeSmtpAlias(db: Db, workspaceId: string, mailboxId: string, rawEmail: string): Promise<AliasEditResult> {
  const mailbox = await loadSmtpMailbox(db, workspaceId, mailboxId)
  if (!mailbox) return { ok: false, status: 404, error: 'Boîte introuvable.' }
  if (mailbox.provider !== 'SMTP') return { ok: false, status: 400, error: 'Les alias Gmail se gèrent dans Gmail.' }

  const email = normalizeEmail(rawEmail)
  const current = parseAliases(mailbox.sendAsAliases)
  if (!email || !current.some((a) => a.email === email)) return { ok: false, status: 404, error: 'Alias introuvable.' }

  const aliases = current.filter((a) => a.email !== email)
  await db.connectedMailbox.update({ where: { id: mailbox.id }, data: { sendAsAliases: toJson(aliases) } })
  const releasedCampaigns = await releaseRemovedAliases(db, mailbox.id, aliases)
  return { ok: true, aliases, releasedCampaigns }
}
