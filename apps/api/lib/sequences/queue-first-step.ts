/**
 * Queues step 1 of a campaign for its qualifying leads.
 *
 * Shared by the launch route and by every path that adds leads to a campaign
 * that is already running: leads assigned to an ACTIVE campaign used to sit
 * there forever, because only the launch queued anything.
 *
 * Qualifying leads: scoreBadge IN (FAST_TRACK, NORMAL), doNotContact=false,
 * step 1 not already queued or sent (a failed one with attempts left is
 * queued again).
 */

import type { PrismaClient } from '@prisma/client'
import { SENDABLE_BADGES } from '@/lib/leads/badges'
import { checkEmailSendQuota } from '@/lib/stripe/quota'
import { enqueueStepSends } from '@/lib/sequences/enqueue'
import { MAX_SEND_ATTEMPTS } from '@/lib/sequences/types'

/** Upper bound of one launch on unlimited plans. */
export const MAX_LAUNCH_LEADS = 5000

export type QueueFirstStepResult =
  | { ok: true; queued: number; firstStep: { id: string; channel: string }; totalSteps: number }
  | { ok: false; reason: 'NO_STEP' | 'QUOTA' | 'NO_LEADS'; quota?: { current: number; limit: number } }

export async function queueFirstStep(
  db: PrismaClient,
  params: { workspaceId: string; campaignId: string; leadIds?: string[] },
): Promise<QueueFirstStepResult> {
  const { workspaceId, campaignId, leadIds } = params

  const steps = await db.campaignEmailStep.findMany({
    where:   { campaignId },
    orderBy: { position: 'asc' },
    select:  { id: true, channel: true },
  })
  const firstStep = steps[0]
  if (!firstStep) return { ok: false, reason: 'NO_STEP' }

  const quota = await checkEmailSendQuota(workspaceId)
  if (!quota.allowed) return { ok: false, reason: 'QUOTA', quota: { current: quota.current, limit: quota.limit } }

  const maxToQueue = quota.limit === Infinity
    ? MAX_LAUNCH_LEADS
    : Math.min(MAX_LAUNCH_LEADS, Math.max(0, quota.limit - quota.current))

  const leads = await db.lead.findMany({
    where: {
      campaignId,
      workspaceId,
      ...(leadIds ? { id: { in: leadIds } } : {}),
      scoreBadge:   { in: [...SENDABLE_BADGES] },
      doNotContact: false,
      emailSends:   {
        none: {
          emailStepId: firstStep.id,
          OR: [{ status: { not: 'FAILED' } }, { attempts: { gte: MAX_SEND_ATTEMPTS } }],
        },
      },
    },
    take:    maxToQueue,
    orderBy: [{ scoreBadge: 'asc' }, { aiScore: 'desc' }],
    select:  { id: true },
  })
  if (leads.length === 0) return { ok: false, reason: 'NO_LEADS' }

  const queued = await enqueueStepSends(db, {
    campaignId,
    stepId:  firstStep.id,
    leadIds: leads.map((l) => l.id),
  })
  return { ok: true, queued, firstStep, totalSteps: steps.length }
}
