/**
 * Step-1 sending for a freshly-prospected campaign.
 *
 * The hourly sequence cron (campaignProcessor -> findLeadsDueForNextStep) only
 * handles FOLLOW-UP steps (it requires a step-1 send to already exist). So the
 * initial step-1 send must happen here, right after collection.
 *
 * Deliverability policy (founder decision): we do NOT silently block uncertain
 * emails. We auto-send only to DELIVERABLE leads (Hunter status valid/accept_all
 * or unverified-but-not-flagged), and we return the UNCERTAIN ones (invalid /
 * unknown) so the caller can ask the user "contact them anyway?" via a
 * notification. The user can then opt in (which sends to them explicitly).
 */

import type { PrismaClient } from '@prisma/client'
import { SENDABLE_BADGES } from '@/lib/leads/badges'
import { enqueueStepSends } from '@/lib/sequences/enqueue'
import { kickEmailDrip } from '@/lib/inngest/email-drip'
import { checkEmailSendQuota } from '@/lib/stripe/quota'

const isUncertain = (status?: string | null): boolean =>
  status === 'invalid' || status === 'unknown'

export interface QualifiedSplit {
  campaignActive:   boolean
  firstStepId:      string | null
  deliverableIds:   string[]
  uncertainIds:     string[]
}

/**
 * Split a campaign's qualified (FAST_TRACK + NORMAL, contactable) leads into
 * those with a deliverable email vs those with an uncertain one.
 */
export async function splitQualifiedByDeliverability(
  db: PrismaClient,
  campaignId: string,
  savedLeadIds: string[],
): Promise<QualifiedSplit> {
  const [campaign, firstStep] = await Promise.all([
    db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } }),
    db.campaignEmailStep.findFirst({ where: { campaignId, position: 0 }, select: { id: true } }),
  ])

  const result: QualifiedSplit = {
    campaignActive: campaign?.status === 'ACTIVE',
    firstStepId:    firstStep?.id ?? null,
    deliverableIds: [],
    uncertainIds:   [],
  }
  if (!result.campaignActive || !result.firstStepId || savedLeadIds.length === 0) return result

  // One sending rule everywhere (lib/leads/badges): FAST_TRACK and NORMAL.
  // It used to be "anything but SKIP" here, so NURTURE leads and leads whose
  // scoring had failed were emailed from the wizard but not on assignment.
  // The leads set aside are reported in the completion notification.
  const qualified = await db.lead.findMany({
    where: {
      id:           { in: savedLeadIds },
      campaignId,   // only the leads that joined this campaign
      scoreBadge:   { in: [...SENDABLE_BADGES] },
      doNotContact: false,
    },
    orderBy: [{ scoreBadge: 'asc' }, { aiScore: 'desc' }],
    select:  { id: true, enrichment: { select: { emailStatus: true } } },
  })

  for (const l of qualified) {
    if (isUncertain(l.enrichment?.emailStatus)) result.uncertainIds.push(l.id)
    else result.deliverableIds.push(l.id)
  }
  return result
}

/**
 * Queue step 1 for a specific set of leads and start the sending queue.
 * Used both for the auto-send (deliverable leads) and the explicit "contact
 * anyway" action (uncertain leads the user opted into). Quota-capped. The
 * emails leave at the mailbox's own rhythm (lib/sequences/drip-queue);
 * nothing is sent inside the caller's request or step.
 */
export async function sendStep1ToLeads(
  db: PrismaClient,
  params: { workspaceId: string; campaignId: string; firstStepId: string; leadIds: string[] },
): Promise<{ queued: number; attempted: number }> {
  const { workspaceId, campaignId, firstStepId, leadIds } = params
  if (leadIds.length === 0) return { queued: 0, attempted: 0 }

  const emailQuota = await checkEmailSendQuota(workspaceId).catch(() => null)
  const cap = emailQuota && emailQuota.limit !== Infinity
    ? Math.max(0, emailQuota.limit - emailQuota.current)
    : 5000
  const toQueue = leadIds.slice(0, cap)

  const queued = await enqueueStepSends(db, { campaignId, stepId: firstStepId, leadIds: toQueue })
  if (queued > 0) await kickEmailDrip(`step1:${campaignId}`)

  console.log('[send-step-1] queued', JSON.stringify({ campaignId, attempted: toQueue.length, queued }))
  return { queued, attempted: toQueue.length }
}
