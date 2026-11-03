/**
 * How long a launch will take to go out: shown to the customer right after
 * launching, so "queued" never reads as "stuck".
 *
 * Email: bounded by the sending mailbox's daily cap (what is left of it in
 * the rolling 24h) and its rhythm (pacing.ts). LinkedIn: bounded by the
 * account's daily cap and the LinkedIn gap. An estimate, not a promise: other
 * campaigns sharing the mailbox draw on the same capacity.
 */

import type { PrismaClient } from '@prisma/client'
import { resolveSendingMailbox } from '@/lib/email/sender-router'
import { DEFAULT_DAILY_CAP, dailyLimit } from '@/lib/deliverability/send-policy'
import { mailboxDailyCap } from './email-gate'
import { averageEmailGapSeconds, DEFAULT_LINKEDIN_MIN_GAP_SECONDS } from './pacing'
import { SENT_STATUSES } from './types'
import { senderAddress } from '@/lib/email/sender-identity'

const DAY_MS = 24 * 60 * 60 * 1000
const LINKEDIN_AVERAGE_GAP_SECONDS = DEFAULT_LINKEDIN_MIN_GAP_SECONDS + 30

export interface SendEstimate {
  /** Messages allowed per day for this sender. */
  dailyLimit: number
  /** Messages of this launch that can leave today. */
  today: number
  /** Minutes to send today's share at the sender's rhythm. */
  minutesToday: number
  /** Calendar days for the whole launch (1 = everything today). */
  days: number
  /** Address the emails leave from (null: LinkedIn or Phantera's shared domain). */
  sender: string | null
  /** Set when the provider asked to slow down; sending resumes on its own. */
  pausedUntil: string | null
}

export function computeEstimate(queued: number, limit: number, usedToday: number, averageGapSeconds: number) {
  const remaining = Math.max(0, limit - usedToday)
  const today = Math.min(queued, remaining)
  const rest = queued - today
  const days = rest <= 0 ? 1 : 1 + Math.ceil(rest / Math.max(1, limit))
  return { today, days, minutesToday: Math.ceil((today * averageGapSeconds) / 60) }
}

export async function estimateLaunch(
  db: PrismaClient,
  params: { workspaceId: string; campaignId: string; channel: string; queued: number },
): Promise<SendEstimate> {
  const now = Date.now()

  if (params.channel === 'LINKEDIN') {
    const limit = Number(process.env.LINKEDIN_DAILY_CAP ?? 25)
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const usedToday = await db.emailSend.count({
      where: { status: 'SENT', sentAt: { gte: startOfDay }, emailStep: { channel: 'LINKEDIN' }, campaign: { workspaceId: params.workspaceId } },
    })
    return { ...computeEstimate(params.queued, limit, usedToday, LINKEDIN_AVERAGE_GAP_SECONDS), dailyLimit: limit, sender: null, pausedUntil: null }
  }

  const since = new Date(now - DAY_MS)
  const mailbox = await resolveSendingMailbox(params.workspaceId, params.campaignId)
  if (!mailbox) {
    const usedToday = await db.emailSend.count({
      where: { status: { in: [...SENT_STATUSES] }, sentAt: { gte: since }, mailboxId: null, campaign: { workspaceId: params.workspaceId } },
    })
    return { ...computeEstimate(params.queued, DEFAULT_DAILY_CAP, usedToday, averageEmailGapSeconds()), dailyLimit: DEFAULT_DAILY_CAP, sender: null, pausedUntil: null }
  }

  const limit = dailyLimit({
    mailboxAgeDays: Math.floor((now - mailbox.createdAt.getTime()) / DAY_MS),
    sentToday: 0,
    dailyCap: mailboxDailyCap(mailbox),
    warmup: mailbox.warmupEnabled === true,
  })
  const usedToday = await db.emailSend.count({
    where: { mailboxId: mailbox.id, status: { in: [...SENT_STATUSES] }, sentAt: { gte: since } },
  })
  const paused = mailbox.sendPausedUntil && mailbox.sendPausedUntil.getTime() > now ? mailbox.sendPausedUntil : null
  return {
    ...computeEstimate(params.queued, limit, usedToday, averageEmailGapSeconds()),
    dailyLimit: limit,
    sender: senderAddress(mailbox, mailbox.fromAlias).email,
    pausedUntil: paused ? paused.toISOString() : null,
  }
}
