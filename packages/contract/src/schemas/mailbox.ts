/** Mailboxes (Gmail, Outlook, SMTP) and their send-as aliases. */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const MailboxProvider = z.enum(['GMAIL', 'OUTLOOK', 'SMTP'])
export const MailboxStatus = z.enum(['CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR'])

/** parseAliases() output (lib/email/sender-identity.ts). */
export const MailboxAlias = z.object({
  email: z.string(),
  displayName: z.string().nullable(),
  source: z.enum(['GMAIL', 'MANUAL']),
})

/** One row of GET /api/mailbox. */
export const MailboxRow = z.object({
  id: Id,
  provider: MailboxProvider,
  email: z.string(),
  displayName: z.string().nullable(),
  status: MailboxStatus,
  isDefault: z.boolean(),
  lastSyncAt: IsoDate.nullable(),
  lastSyncError: z.string().nullable(),
  createdAt: IsoDate,
  dailyCap: z.number().int(),
  warmupEnabled: z.boolean(),
  sendPausedUntil: IsoDate.nullable(),
  sharedWithTeam: z.boolean(),
  ownerName: z.string(),
  canShare: z.boolean(),
  aliases: z.array(MailboxAlias),
  sentLast24h: z.number().int(),
  mine: z.boolean(),
  canManage: z.boolean(),
})

/** One mailbox of GET /api/mailbox/senders. */
export const SenderMailbox = z.object({
  id: Id,
  provider: MailboxProvider,
  email: z.string(),
  displayName: z.string().nullable(),
  status: MailboxStatus,
  isDefault: z.boolean(),
  aliasesSyncedAt: IsoDate.nullable(),
  aliasesSupported: z.boolean(),
  aliases: z.array(MailboxAlias),
})

/** Plan mailbox quota; `limit` null = unlimited. */
export const MailboxQuota = z.object({
  planName: z.string(),
  used: z.number().int(),
  limit: z.number().int().nullable(),
})

/** Per-mailbox result of POST /api/mailbox/sync. */
export const MailboxSyncResult = z.object({
  mailboxEmail: z.string(),
  provider: z.string(),
  repliesFound: z.number().int(),
  error: z.string().optional(),
})
