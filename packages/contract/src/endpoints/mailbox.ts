/** Connected mailboxes: list, disconnect, settings, aliases, senders, SMTP, reply sync. */

import { z } from 'zod'
import { endpoint, Id, Ok } from '../define'
import { MailboxAlias, MailboxProvider, MailboxQuota, MailboxRow, MailboxStatus, MailboxSyncResult, SenderMailbox } from '../schemas/mailbox'

const MAX_DAILY_CAP = 500 // lib/deliverability/send-policy.ts

export const mailboxEndpoints = [
  // app/api/mailbox/route.ts
  endpoint({
    id: 'mailbox.list',
    method: 'GET',
    path: '/api/mailbox',
    summary: 'Mailboxes visible to the caller (own + shared; all for admins). Plan quota travels in X-Mailbox-Limit / X-Mailbox-Plan headers.',
    auth: 'session',
    query: z.object({ workspaceId: Id }),
    response: z.array(MailboxRow),
  }),

  // app/api/mailbox/route.ts
  endpoint({
    id: 'mailbox.disconnect',
    method: 'DELETE',
    path: '/api/mailbox',
    summary: 'Disconnect a mailbox. 409 MAILBOX_IN_USE (campaigns, total) unless force=1, which pauses them.',
    auth: 'stepUp',
    query: z.object({
      id: Id,
      workspaceId: Id,
      /** Only the literal "1" forces. */
      force: z.string().optional(),
    }),
    response: z.object({ ok: z.literal(true), pausedCampaigns: z.number().int() }),
  }),

  // app/api/mailbox/route.ts
  endpoint({
    id: 'mailbox.update',
    method: 'PATCH',
    path: '/api/mailbox',
    summary: 'Set default mailbox, daily cap, warm-up, or team sharing (admins only).',
    auth: 'session',
    body: z.object({
      workspaceId: z.string().cuid(),
      mailboxId: z.string().cuid(),
      isDefault: z.boolean().optional(),
      dailyCap: z.number().int().min(1).max(MAX_DAILY_CAP).optional(),
      warmupEnabled: z.boolean().optional(),
      sharedWithTeam: z.boolean().optional(),
    }).refine(
      (b) => b.isDefault !== undefined || b.dailyCap !== undefined || b.warmupEnabled !== undefined || b.sharedWithTeam !== undefined,
      { message: 'Aucun réglage à modifier' },
    ),
    response: z.object({ ok: z.literal(true), pausedCampaigns: z.number().int() }),
  }),

  // app/api/mailbox/aliases/route.ts
  endpoint({
    id: 'mailbox.manageAliases',
    method: 'POST',
    path: '/api/mailbox/aliases',
    summary: 'Sync Gmail send-as aliases, or add/remove an SMTP alias.',
    auth: 'session',
    body: z.discriminatedUnion('action', [
      z.object({ action: z.literal('sync'), mailboxId: z.string().min(1).max(64) }),
      z.object({
        action: z.literal('add'),
        mailboxId: z.string().min(1).max(64),
        email: z.string().min(3).max(254),
        displayName: z.string().max(80).optional(),
      }),
      z.object({ action: z.literal('remove'), mailboxId: z.string().min(1).max(64), email: z.string().min(3).max(254) }),
    ]),
    response: z.union([
      // sync
      z.object({ ok: z.literal(true), aliases: z.array(MailboxAlias) }),
      // add / remove
      z.object({ ok: z.literal(true), aliases: z.array(MailboxAlias), releasedCampaigns: z.number().int() }),
    ]),
  }),

  // app/api/mailbox/senders/route.ts
  endpoint({
    id: 'mailbox.senders',
    method: 'GET',
    path: '/api/mailbox/senders',
    summary: 'Addresses a campaign can be sent from (mailboxes + aliases) and the plan quota.',
    auth: 'session',
    query: z.object({ campaignId: Id.optional() }),
    response: z.object({ quota: MailboxQuota, mailboxes: z.array(SenderMailbox) }),
  }),

  // app/api/mailbox/smtp/route.ts
  endpoint({
    id: 'mailbox.connectSmtp',
    method: 'POST',
    path: '/api/mailbox/smtp',
    summary: 'Test then save a custom SMTP mailbox (upsert by workspace + email).',
    auth: 'stepUp',
    body: z.object({
      workspaceId: z.string().cuid(),
      host: z.string().min(1).max(253),
      port: z.number().int().min(1).max(65535).default(587),
      secure: z.boolean().default(true),
      email: z.string().email(),
      password: z.string().min(1),
      displayName: z.string().max(100).optional(),
    }),
    response: z.object({
      id: Id,
      email: z.string(),
      provider: MailboxProvider,
      status: MailboxStatus,
      displayName: z.string().nullable(),
    }),
  }),

  // app/api/mailbox/sync/route.ts
  endpoint({
    id: 'mailbox.sync',
    method: 'POST',
    path: '/api/mailbox/sync',
    summary: 'Poll the caller\'s Gmail/Outlook mailboxes for new replies now.',
    auth: 'session',
    body: z.object({
      workspaceId: Id,
      /** Clears history cursors so the last 48 h are re-fetched. */
      resetHistory: z.boolean().optional(),
    }),
    response: z.object({
      ok: z.literal(true),
      totalReplies: z.number().int(),
      results: z.array(MailboxSyncResult),
    }),
  }),
]
