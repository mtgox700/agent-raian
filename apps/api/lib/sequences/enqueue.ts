/**
 * Queue a campaign step for a set of leads.
 *
 * Launching a campaign no longer sends inside the HTTP request (a 100-lead
 * launch hit the 60s function limit before the campaign was even marked
 * ACTIVE, so nothing went out). It writes one PENDING row per lead and
 * returns at once; the sending queue (drip-queue) delivers them at the
 * mailbox's own safe rhythm.
 *
 * The (leadId, emailStepId) pair is unique, so leads already queued or sent
 * for this step are left untouched. A step that failed but still has retry
 * budget is put back in the queue with its attempt count kept.
 */

import type { PrismaClient } from '@prisma/client'
import { MAX_SEND_ATTEMPTS } from './types'

const INSERT_CHUNK = 500

export async function enqueueStepSends(
  db: Pick<PrismaClient, 'emailSend'>,
  params: { campaignId: string; stepId: string; leadIds: string[] },
): Promise<number> {
  const leadIds = [...new Set(params.leadIds)]
  let queued = 0
  for (let i = 0; i < leadIds.length; i += INSERT_CHUNK) {
    const chunk = leadIds.slice(i, i + INSERT_CHUNK)
    const created = await db.emailSend.createMany({
      data: chunk.map((leadId) => ({
        leadId,
        campaignId:  params.campaignId,
        emailStepId: params.stepId,
        status:      'PENDING' as const,
      })),
      skipDuplicates: true,
    })
    const requeued = await db.emailSend.updateMany({
      where: {
        emailStepId: params.stepId,
        leadId:      { in: chunk },
        status:      'FAILED',
        attempts:    { lt: MAX_SEND_ATTEMPTS },
      },
      data: { status: 'PENDING' },
    })
    queued += created.count + requeued.count
  }
  return queued
}
