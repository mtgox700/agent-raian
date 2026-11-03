/**
 * Deliverability gate on the email send path.
 *
 * Resolves the DB-bound inputs (workspace suppression list, the sending
 * mailbox's last-24h volume) and asks the pure policy in
 * lib/deliverability/gate whether one email may leave now:
 *   - SUPPRESSED      address opted out / bounced / complained in this workspace
 *   - MAILBOX_CAP     the mailbox reached its daily cap (set by the customer,
 *                     optional warm-up ramp) or the provider paused it; the send
 *                     stays queued and goes out as soon as capacity frees up
 *   - CONTENT_FLAGGED the rendered email trips the spam linter
 *
 * The shared Resend domain (no mailbox) has no per-mailbox cap: it is covered
 * by the workspace-wide cap in send-step.
 */

import { evaluateSendGate } from '@/lib/deliverability/gate'
import { DEFAULT_DAILY_CAP, MAX_DAILY_CAP } from '@/lib/deliverability/send-policy'
import { filterSendable, normalizeEmail, type SuppressionDb } from '@/lib/deliverability/suppression'
import { SENT_STATUSES, type SkipReason } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface EmailGateDb extends SuppressionDb {
  emailSend: {
    count(args: {
      where: { mailboxId: string; status: { in: string[] }; sentAt: { gte: Date } }
    }): Promise<number>
  }
}

export interface GateMailbox {
  id: string
  createdAt: Date
  /** Emails per rolling 24h chosen by the customer (default 50). */
  dailyCap?: number | null
  /** Warm-up ramp for a brand-new mailbox (5 -> 10 -> 20 -> cap). Off by default. */
  warmupEnabled?: boolean | null
  /** Set when the provider refused sends (quota, rate limit). */
  sendPausedUntil?: Date | null
}

export interface EmailGateInput {
  db: EmailGateDb
  workspaceId: string
  to: string
  /** Mailbox that will send the email, or null for the Resend shared domain. */
  mailbox: GateMailbox | null
  content: { subject: string; body: string }
  now?: Date
}

export type EmailGateResult =
  | { allowed: true }
  | { allowed: false; reason: Extract<SkipReason, 'SUPPRESSED' | 'MAILBOX_CAP' | 'CONTENT_FLAGGED'>; detail: string }

export function mailboxDailyCap(mailbox: Pick<GateMailbox, 'dailyCap'>): number {
  const cap = mailbox.dailyCap ?? DEFAULT_DAILY_CAP
  return Number.isFinite(cap) && cap > 0 ? Math.min(cap, MAX_DAILY_CAP) : DEFAULT_DAILY_CAP
}

export async function checkEmailGate(input: EmailGateInput): Promise<EmailGateResult> {
  const now = input.now ?? new Date()
  const email = normalizeEmail(input.to)

  const sendable = await filterSendable(input.db, input.workspaceId, [email])
  const suppressed = sendable.length === 0

  const mailbox = input.mailbox
  if (!suppressed && mailbox?.sendPausedUntil && mailbox.sendPausedUntil > now) {
    return { allowed: false, reason: 'MAILBOX_CAP', detail: `MAILBOX: paused by the provider until ${mailbox.sendPausedUntil.toISOString()}` }
  }

  let ageDays = Number.POSITIVE_INFINITY
  let sentLast24h = 0
  if (mailbox) {
    ageDays = Math.floor((now.getTime() - mailbox.createdAt.getTime()) / DAY_MS)
    sentLast24h = await input.db.emailSend.count({
      where: {
        mailboxId: mailbox.id,
        status: { in: [...SENT_STATUSES] },
        sentAt: { gte: new Date(now.getTime() - DAY_MS) },
      },
    })
  }

  const decision = evaluateSendGate({
    suppressed,
    mailbox: {
      ageDays,
      sentToday: sentLast24h,
      dailyCap: mailbox ? mailboxDailyCap(mailbox) : DEFAULT_DAILY_CAP,
      warmup: mailbox?.warmupEnabled === true,
    },
    content: input.content,
  })
  if (decision.allowed) return { allowed: true }

  const detail = decision.blocks.join('; ')
  if (suppressed) return { allowed: false, reason: 'SUPPRESSED', detail }
  if (!decision.capacity.allowed) return { allowed: false, reason: 'MAILBOX_CAP', detail }
  return { allowed: false, reason: 'CONTENT_FLAGGED', detail }
}
