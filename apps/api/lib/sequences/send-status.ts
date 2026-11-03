/**
 * Why a campaign's queued messages are (not) leaving right now.
 *
 * The sending queue holds messages silently when a limit applies (daily cap
 * of the mailbox, monthly plan quota, provider pause, disconnected mailbox,
 * paused campaign). Silent was the bug: a customer saw "13 sent" for an hour
 * with no explanation and no log. This reports the first limit that applies
 * and when sending resumes, using the same rules as send-step.
 */

import type { PrismaClient } from '@prisma/client'
import { resolveSendingMailbox } from '@/lib/email/sender-router'
import { senderHold } from '@/lib/email/sender-hold'
import { DEFAULT_DAILY_CAP, dailyLimit } from '@/lib/deliverability/send-policy'
import { checkEmailSendQuota } from '@/lib/stripe/quota'
import { mailboxDailyCap } from './email-gate'
import { SENT_STATUSES } from './types'
import { senderAddress } from '@/lib/email/sender-identity'

const DAY_MS = 24 * 60 * 60 * 1000

export type SendHold =
  | 'CAMPAIGN_PAUSED'
  | 'QUOTA'
  | 'MAILBOX_DISCONNECTED'
  | 'NO_SENDER'
  | 'MAILBOX_PAUSED'
  | 'MAILBOX_CAP'
  | 'SHARED_CAP'

export interface SendStatus {
  queued: number
  hold: SendHold | null
  /** When the hold lifts on its own (ISO), null if it needs an action. */
  resumesAt: string | null
  sender: string | null
  sentLast24h: number
  dailyLimit: number
  quota: { current: number; limit: number | null }
}

/** The day window frees one slot when its oldest send turns 24h old. */
async function nextFreeSlot(db: PrismaClient, where: Record<string, unknown>, now: number): Promise<string | null> {
  const oldest = await db.emailSend.findFirst({
    where: { ...where, status: { in: [...SENT_STATUSES] }, sentAt: { gte: new Date(now - DAY_MS) } },
    orderBy: { sentAt: 'asc' },
    select: { sentAt: true },
  })
  return oldest?.sentAt ? new Date(oldest.sentAt.getTime() + DAY_MS).toISOString() : null
}

export async function getSendStatus(
  db: PrismaClient,
  params: { workspaceId: string; campaignId: string; campaignActive: boolean },
): Promise<SendStatus> {
  const now = Date.now()
  const { workspaceId, campaignId } = params
  const [queued, quota, mailbox] = await Promise.all([
    db.emailSend.count({ where: { campaignId, status: 'PENDING' } }),
    checkEmailSendQuota(workspaceId),
    resolveSendingMailbox(workspaceId, campaignId),
  ])
  const base = {
    queued,
    sender: mailbox ? senderAddress(mailbox, mailbox.fromAlias).email : null,
    quota: { current: quota.current, limit: Number.isFinite(quota.limit) ? quota.limit : null },
  }
  const result = (hold: SendHold | null, resumesAt: string | null, sentLast24h: number, limit: number): SendStatus =>
    ({ ...base, hold: queued > 0 ? hold : null, resumesAt: queued > 0 ? resumesAt : null, sentLast24h, dailyLimit: limit })

  const windowStart = new Date(now - DAY_MS)
  if (!mailbox) {
    const used = await db.emailSend.count({
      where: { mailboxId: null, status: { in: [...SENT_STATUSES] }, sentAt: { gte: windowStart }, campaign: { workspaceId } },
    })
    if (!params.campaignActive) return result('CAMPAIGN_PAUSED', null, used, DEFAULT_DAILY_CAP)
    if (!quota.allowed) return result('QUOTA', null, used, DEFAULT_DAILY_CAP)
    // The same rule as the send step, so the page says what the sender does.
    const owner = await db.campaign.findUnique({ where: { id: campaignId }, select: { ownerUserId: true } })
    const waiting = owner ? await senderHold(db, { id: campaignId, workspaceId, ownerUserId: owner.ownerUserId }) : null
    if (waiting) return result(waiting.hold, null, used, DEFAULT_DAILY_CAP)
    if (used >= DEFAULT_DAILY_CAP) {
      return result('SHARED_CAP', await nextFreeSlot(db, { mailboxId: null, campaign: { workspaceId } }, now), used, DEFAULT_DAILY_CAP)
    }
    return result(null, null, used, DEFAULT_DAILY_CAP)
  }

  const limit = dailyLimit({
    mailboxAgeDays: Math.floor((now - mailbox.createdAt.getTime()) / DAY_MS),
    sentToday: 0,
    dailyCap: mailboxDailyCap(mailbox),
    warmup: mailbox.warmupEnabled === true,
  })
  const used = await db.emailSend.count({
    where: { mailboxId: mailbox.id, status: { in: [...SENT_STATUSES] }, sentAt: { gte: windowStart } },
  })
  if (!params.campaignActive) return result('CAMPAIGN_PAUSED', null, used, limit)
  if (!quota.allowed) return result('QUOTA', null, used, limit)
  if (mailbox.sendPausedUntil && mailbox.sendPausedUntil.getTime() > now) {
    return result('MAILBOX_PAUSED', mailbox.sendPausedUntil.toISOString(), used, limit)
  }
  if (used >= limit) return result('MAILBOX_CAP', await nextFreeSlot(db, { mailboxId: mailbox.id }, now), used, limit)
  return result(null, null, used, limit)
}
