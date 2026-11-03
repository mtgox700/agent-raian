/**
 * processCampaign
 *
 * Batch processor for a single ACTIVE campaign:
 *  1. Finds all leads due for their next step
 *  2. Queues each due step for the sending queue (lib/sequences/drip-queue)
 *  3. Detects sequence completion: if zero candidates remain after processing,
 *     checks whether ALL leads are exhausted and marks campaign COMPLETED
 *  4. Updates campaign.lastProcessedAt
 *
 * Safe to run concurrently: idempotency is enforced per send in sendStepToLead.
 * Exits early if already processed in the last 50 minutes (overlap guard).
 */

import type { PrismaClient } from '@prisma/client'
import { findLeadsDueForNextStep } from './find-due'
import { enqueueStepSends } from './enqueue'
import { kickEmailDrip } from '@/lib/inngest/email-drip'
import { checkEmailSendQuota } from '@/lib/stripe/quota'
import { SENDING_STALE_MS, type CampaignProcessResult } from './types'

const OVERLAP_GUARD_MS = 50 * 60 * 1000  // 50 minutes

export async function processCampaign(
  db: PrismaClient,
  campaignId: string,
  now: Date = new Date(),
): Promise<CampaignProcessResult> {
  const result: CampaignProcessResult = {
    campaignId,
    sent:      0,
    queued:    0,
    skipped:   0,
    errors:    0,
    completed: false,
  }

  // 1. Load campaign: verify ACTIVE + overlap guard
  const campaign = await db.campaign.findUnique({
    where:  { id: campaignId },
    select: { status: true, workspaceId: true, lastProcessedAt: true },
  })

  if (!campaign || campaign.status !== 'ACTIVE') {
    result.skipped++
    return result
  }

  // Atomic claim: update lastProcessedAt to `now` only if the campaign has not
  // been processed recently. This acts as a soft mutex: prevents two concurrent
  // cron invocations from both processing the same campaign.
  const claimed = await db.campaign.updateMany({
    where: {
      id:     campaignId,
      status: 'ACTIVE',
      OR: [
        { lastProcessedAt: null },
        { lastProcessedAt: { lt: new Date(now.getTime() - OVERLAP_GUARD_MS) } },
      ],
    },
    data: { lastProcessedAt: now },
  })

  // Another invocation already claimed this campaign in this window: skip
  if (claimed.count === 0) return result

  // 2. Find due candidates
  const candidates = await findLeadsDueForNextStep(db, campaignId, now)

  // 2b. Enforce the monthly email-send quota. Follow-up steps (2+) consume the
  // same quota as step 1: without this gate, a 5-step sequence would silently
  // send up to 5× the plan limit. Cap this run to whatever quota remains; any
  // leads left over stay due and will be picked up once quota refreshes.
  const quota = await checkEmailSendQuota(campaign.workspaceId)
  const remainingQuota = quota.limit === Infinity
    ? candidates.length
    : Math.max(0, quota.limit - quota.current)
  const toSend = candidates.slice(0, remainingQuota)

  // 3. Queue the due steps; the sending queue (drip-queue) delivers them at
  //    each mailbox's own rhythm. Sending here in bursts is what got mailboxes
  //    blocked, and a large campaign could not finish within the function.
  const byStep = new Map<string, string[]>()
  for (const c of toSend) {
    byStep.set(c.nextStepId, [...(byStep.get(c.nextStepId) ?? []), c.leadId])
  }
  for (const [stepId, leadIds] of byStep) {
    try {
      result.queued += await enqueueStepSends(db, { campaignId, stepId, leadIds })
    } catch (err: unknown) {
      result.errors++
      console.error(`[process-campaign] enqueue failed campaignId=${campaignId} stepId=${stepId}:`, err instanceof Error ? err.message : String(err))
    }
  }
  if (result.queued > 0) await kickEmailDrip(`followups:${campaignId}`)

  // 4. Check for sequence completion (lastProcessedAt was already set atomically above).
  //    Evaluated on EVERY run: not just runs that sent something. The previous
  //    `result.sent > 0` gate left campaigns ACTIVE forever whenever the final due
  //    step landed on a run that only skipped (e.g. single-step campaigns, where
  //    there is never a "next step" to send, or runs where the last leads were DNC).
  //    A campaign is complete when no leads remain due now or in the future AND at
  //    least one lead successfully completed step 1 (guards against false-positive
  //    completion on campaigns where every step-1 send failed/bounced).
  //
  //    If this run was throttled by the send quota, the un-sent leads are still due,
  //    so stillPending will be non-empty and the campaign correctly stays ACTIVE.
  const farFuture    = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  const stillPending = await findLeadsDueForNextStep(db, campaignId, farFuture)

  // Sends queued by the email pacing gate (PENDING rows, see drip-queue) are
  // still to go out: never complete the campaign while some remain.
  // A SENDING row older than SENDING_STALE_MS is a dead worker's leftover:
  // it must not keep the campaign open forever.
  const queuedSends = await db.emailSend.count({
    where: {
      campaignId,
      OR: [
        { status: 'PENDING' },
        // WhatsApp/SMS messages still in the user's "À envoyer" queue.
        { status: 'AWAITING_USER' },
        { status: 'SENDING', createdAt: { gte: new Date(Date.now() - SENDING_STALE_MS) } },
      ],
    },
  })

  if (stillPending.length === 0 && queuedSends === 0) {
    // Load step 1 to count successful sends (not total EmailSend rows which
    // includes FAILED records: that would cause premature COMPLETED)
    const steps = await db.campaignEmailStep.findMany({
      where:   { campaignId },
      orderBy: { position: 'asc' },
      select:  { id: true },
      take:    1,
    })

    const successfulStep1Count = steps.length > 0
      ? await db.emailSend.count({
          where: {
            campaignId,
            emailStepId: steps[0].id,
            status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
          },
        })
      : 0

    if (successfulStep1Count > 0) {
      await db.campaign.update({
        where: { id: campaignId },
        data:  { status: 'COMPLETED', completedAt: now },
      })
      result.completed = true
    }
  }

  return result
}
