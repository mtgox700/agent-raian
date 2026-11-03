/**
 * findLeadsDueForNextStep
 *
 * For a given ACTIVE campaign, returns every lead that:
 *  1. Has a successful EmailSend for step 1 (position 0)
 *  2. Is NOT marked doNotContact and NOT status='lost'/'converted'
 *  3. Has a next step in the sequence
 *  4. Has NOT yet received the next step successfully
 *  5. Is past the due date: step1.sentAt + nextStep.dayOffset * 24h <= now
 *
 * All dayOffsets are relative to step 1's sentAt for each lead: this means
 * two leads launched a day apart will have their follow-ups staggered correctly.
 */

import type { PrismaClient } from '@prisma/client'
import { MAX_SEND_ATTEMPTS, SENT_STATUSES, STEP_DONE_STATUSES, type SequenceCandidate } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export async function findLeadsDueForNextStep(
  db: PrismaClient,
  campaignId: string,
  now: Date,
): Promise<SequenceCandidate[]> {
  // 1. Load all steps sorted by position
  const steps = await db.campaignEmailStep.findMany({
    where:   { campaignId },
    orderBy: { position: 'asc' },
    select:  { id: true, position: true, dayOffset: true },
  })

  if (steps.length < 2) return [] // no follow-ups possible

  const step1 = steps[0]

  // 2. Load all leads that have a successful step-1 send
  const step1Sends = await db.emailSend.findMany({
    where: {
      campaignId,
      emailStepId: step1.id,
      status: { in: [...SENT_STATUSES] },
    },
    select: {
      leadId: true,
      sentAt: true,
      lead: {
        select: {
          doNotContact: true,
          status:       true,
        },
      },
    },
  })

  if (step1Sends.length === 0) return []

  // Filter out DNC / lost / converted leads
  const eligibleStep1Sends = step1Sends.filter(
    (s) =>
      s.sentAt !== null &&
      !s.lead.doNotContact &&
      s.lead.status !== 'lost' &&
      s.lead.status !== 'converted',
  )

  if (eligibleStep1Sends.length === 0) return []

  // Get the campaign's workspaceId
  const campaign = await db.campaign.findUnique({
    where:  { id: campaignId },
    select: { workspaceId: true },
  })
  if (!campaign) return []

  const candidates: SequenceCandidate[] = []
  const followUpSteps = steps.slice(1) // steps 2, 3, 4…

  for (const nextStep of followUpSteps) {
    // 3. Load lead IDs that already have a successful send for this step
    // A step waiting in the user's "À envoyer" queue is not due again.
    const alreadySentLeadIds = await db.emailSend.findMany({
      where: {
        campaignId,
        emailStepId: nextStep.id,
        status: { in: [...STEP_DONE_STATUSES, 'AWAITING_USER'] },
      },
      select: { leadId: true },
    }).then((rows) => new Set(rows.map((r) => r.leadId)))

    // Build set of leads that have a successful send for the PREVIOUS step
    // (ensures sequential ordering: no lead can skip a step due to a bounce)
    // Leads for whom this step failed too many times are abandoned.
    const gaveUpLeadIds = await db.emailSend.findMany({
      where: {
        campaignId,
        emailStepId: nextStep.id,
        status:      'FAILED',
        attempts:    { gte: MAX_SEND_ATTEMPTS },
      },
      select: { leadId: true },
    }).then((rows) => new Set(rows.map((r) => r.leadId)))

    const prevStep = steps[followUpSteps.indexOf(nextStep)]  // steps[i] where i = nextStep.position - 1
    // A skipped WhatsApp/SMS step lets the sequence go on to the next one.
    const prevStepSuccessLeadIds = await db.emailSend.findMany({
      where: {
        campaignId,
        emailStepId: prevStep.id,
        status: { in: [...STEP_DONE_STATUSES] },
      },
      select: { leadId: true },
    }).then((rows) => new Set(rows.map((r) => r.leadId)))

    for (const send of eligibleStep1Sends) {
      if (alreadySentLeadIds.has(send.leadId)) continue
      if (gaveUpLeadIds.has(send.leadId)) continue
      if (!send.sentAt) continue

      // CRITICAL FIX: require the previous step to have been sent successfully
      if (!prevStepSuccessLeadIds.has(send.leadId)) continue

      const dueAt = new Date(send.sentAt.getTime() + nextStep.dayOffset * MS_PER_DAY)
      if (dueAt > now) continue

      candidates.push({
        leadId:           send.leadId,
        campaignId,
        workspaceId:      campaign.workspaceId,
        nextStepId:       nextStep.id,
        nextStepPosition: nextStep.position,
        dueAt,
      })
    }
  }

  return candidates
}
