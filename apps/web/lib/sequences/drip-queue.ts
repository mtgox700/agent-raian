/**
 * drainQueuedSends: one pass of the sending queue.
 *
 * Every campaign send (launch, follow-ups, retries) is a PENDING EmailSend
 * row; this drainer is what actually sends them. Each pass takes the oldest
 * queued row of every active campaign (per channel) and hands it to
 * sendStepToLead, which decides whether it may leave now:
 *   - the mailbox's pacing slot (one email at a time, randomised gap),
 *   - the mailbox's daily cap and provider pause,
 *   - the LinkedIn daily cap and gap.
 * A row that may not leave yet stays PENDING for a later pass. The Inngest
 * `email-drip` function runs a pass every ~10 seconds while there is work, so
 * a mailbox sends at its own maximum safe rhythm without anyone waiting.
 *
 * Safety:
 * - Only ACTIVE campaigns: pausing a campaign stops its queue immediately.
 * - Skips PENDING rows younger than EMAIL_IN_FLIGHT_SEC: they may belong to a
 *   send running right now in another worker.
 * - Monthly quota checked per workspace.
 * - sendStepToLead is idempotent and at-most-once (SENDING guard, unique
 *   lead/step row), so overlapping passes never double-send.
 */

import type { PrismaClient } from '@prisma/client'
import { sendStepToLead } from './send-step'
import { checkEmailSendQuota } from '@/lib/stripe/quota'
import { EMAIL_IN_FLIGHT_SEC } from './pacing'
import type { StepSendResult } from './types'
import { revealForUpcomingPhoneSteps } from '@/lib/phone/apollo-reveal'

/** Campaign heads handled per pass; the next pass picks up the rest. */
const MAX_HEADS_PER_PASS = 100
/** Sends running in parallel within a pass (different campaigns). */
const PASS_CONCURRENCY = 8

export interface QueueHead {
  leadId: string
  campaignId: string
  emailStepId: string
  workspaceId: string
  channel: string
}

export interface DripResult {
  picked: number
  sent: number
  skipped: number
  errors: number
  /** Why heads were held this pass (MAILBOX_CAP, PACED, …): logged per run. */
  holds: Record<string, number>
}

type DripDb = Pick<PrismaClient, '$queryRaw'>

/** Oldest queued row of each active campaign and channel. */
export async function findQueueHeads(db: DripDb, now: Date = new Date()): Promise<QueueHead[]> {
  const inFlightCutoff = new Date(now.getTime() - EMAIL_IN_FLIGHT_SEC * 1000)
  // Oldest heads first, so no campaign waits behind others that are blocked.
  return db.$queryRaw<QueueHead[]>`
    SELECT "leadId", "campaignId", "emailStepId", "workspaceId", "channel"
    FROM (
      SELECT DISTINCT ON (es."campaignId", st."channel")
        es."leadId", es."campaignId", es."emailStepId", c."workspaceId",
        st."channel"::text AS "channel", es."createdAt"
      FROM "EmailSend" es
      JOIN "Campaign" c ON c."id" = es."campaignId"
      JOIN "CampaignEmailStep" st ON st."id" = es."emailStepId"
      WHERE es."status" = 'PENDING'
        AND c."status" = 'ACTIVE'
        AND es."createdAt" < ${inFlightCutoff}
      ORDER BY es."campaignId", st."channel", es."createdAt" ASC
    ) heads
    ORDER BY "createdAt" ASC
    LIMIT ${MAX_HEADS_PER_PASS}`
}

export async function drainQueuedSends(db: PrismaClient): Promise<DripResult> {
  const heads = await findQueueHeads(db)
  const result: DripResult = { picked: heads.length, sent: 0, skipped: 0, errors: 0, holds: {} }
  if (heads.length === 0) return result

  const overQuota = await workspacesOverQuota(heads)
  const runnable = heads.filter((h) => !overQuota.has(h.workspaceId))
  result.skipped += heads.length - runnable.length
  if (overQuota.size > 0) result.holds.QUOTA = heads.length - runnable.length

  const outcomes = await runWithConcurrency(runnable, PASS_CONCURRENCY, (h) =>
    sendStepToLead({
      db,
      leadId: h.leadId,
      campaignId: h.campaignId,
      stepId: h.emailStepId,
      workspaceId: h.workspaceId,
    }).catch((err: unknown): StepSendResult => ({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })),
  )
  // A lead heading to a WhatsApp/SMS step gets its number looked up now, so
  // it is known by the day the step comes due (capped, off by default).
  const sentHeads = runnable.filter((_, i) => outcomes[i].status === 'sent')
  await revealForUpcomingPhoneSteps(db, sentHeads.map((h) => ({
    leadId: h.leadId, campaignId: h.campaignId, stepId: h.emailStepId, workspaceId: h.workspaceId,
  }))).catch((err: unknown) => console.warn('[email-drip] phone lookup skipped:', err instanceof Error ? err.message : err))

  for (const r of outcomes) {
    if (r.status === 'sent') result.sent++
    else if (r.status === 'error') result.errors++
    else {
      result.skipped++
      result.holds[r.reason] = (result.holds[r.reason] ?? 0) + 1
    }
  }

  if (result.sent + result.errors > 0) {
    console.info(`[email-drip] picked=${result.picked} sent=${result.sent} skipped=${result.skipped} errors=${result.errors}`)
  }
  return result
}

async function workspacesOverQuota(heads: QueueHead[]): Promise<Set<string>> {
  const workspaceIds = [...new Set(heads.map((h) => h.workspaceId))]
  const checks = await Promise.all(
    workspaceIds.map(async (id) => {
      const quota = await checkEmailSendQuota(id).catch(() => null)
      return quota && !quota.allowed ? id : null
    }),
  )
  return new Set(checks.filter((id): id is string => id !== null))
}

async function runWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
