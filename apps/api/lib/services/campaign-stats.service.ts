/**
 * campaign-stats.service.ts
 *
 * Aggregates per-step analytics for a campaign.
 * Reads EmailSend + EmailReply rows and computes counts + rates.
 * Pure functions: no side effects, no mutations.
 */

import type { StepChannelDb } from '@/lib/types/channels'
import type { PrismaClient } from '@prisma/client'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StepStats {
  stepId:     string
  position:   number   // 0-based
  dayOffset:  number
  /** Send channel: LinkedIn steps have no subject line. */
  channel:    StepChannelDb
  subject:    string
  /** Full email body (template with {{variables}}): for the step detail view */
  body:       string
  /** Sends that left the platform (SENT|DELIVERED|OPENED|CLICKED) */
  totalSent:  number
  /** Subset of totalSent confirmed as delivered */
  delivered:  number
  /** Subset of delivered that were opened */
  opened:     number
  /** Subset of opened where a link was clicked */
  clicked:    number
  /** Hard failures (FAILED | BOUNCED) */
  failed:     number
  /** Still waiting in the sending queue (PENDING) */
  queued:     number
  /** Replies attributed to this step */
  replyCount: number
  /** opened / totalSent × 100 */
  openRate:   number
  /** clicked / totalSent × 100 */
  clickRate:  number
  /** replyCount / totalSent × 100 */
  replyRate:  number
}

export interface CampaignStepStatsResult {
  campaignId:  string
  steps:       StepStats[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getCampaignStepStats(
  db: PrismaClient,
  campaignId: string,
): Promise<CampaignStepStatsResult> {
  // Load all three data sets in parallel
  const [steps, sends, replyLinks] = await Promise.all([
    db.campaignEmailStep.findMany({
      where:   { campaignId },
      orderBy: { position: 'asc' },
      select:  { id: true, position: true, dayOffset: true, channel: true, subject: true, body: true },
    }),

    // All sends for this campaign: just step id + status
    db.emailSend.findMany({
      where:  { campaignId },
      select: { emailStepId: true, status: true },
    }),

    // Replies -> emailSend relation gives us the step attribution
    db.emailReply.findMany({
      where:  { campaignId },
      select: {
        emailSend: { select: { emailStepId: true } },
      },
    }),
  ])

  // ── Aggregate sends by step ──────────────────────────────────────────────

  interface SendBucket {
    sent:      number
    delivered: number
    opened:    number
    clicked:   number
    failed:    number
    queued:    number
  }

  const sendBuckets = new Map<string, SendBucket>()

  for (const s of sends) {
    const bucket = sendBuckets.get(s.emailStepId) ?? {
      sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, queued: 0,
    }

    // Each row represents the highest status reached: statuses are cumulative
    switch (s.status) {
      case 'SENT':
        bucket.sent++
        break
      case 'DELIVERED':
        bucket.sent++
        bucket.delivered++
        break
      case 'OPENED':
        bucket.sent++
        bucket.delivered++
        bucket.opened++
        break
      case 'CLICKED':
        bucket.sent++
        bucket.delivered++
        bucket.opened++
        bucket.clicked++
        break
      case 'FAILED':
      case 'BOUNCED':
        bucket.failed++
        break
      // PENDING: not yet sent, omit from "sent" counts
      case 'PENDING':
        bucket.queued++
        break
      default:
        break
    }

    sendBuckets.set(s.emailStepId, bucket)
  }

  // ── Aggregate replies by step ────────────────────────────────────────────

  const replyCountByStep = new Map<string, number>()
  for (const r of replyLinks) {
    // emailSend may be null if the parent EmailSend was deleted (race condition /
    // manual cleanup). Guard defensively rather than throwing.
    const stepId = r.emailSend?.emailStepId
    if (!stepId) continue
    replyCountByStep.set(stepId, (replyCountByStep.get(stepId) ?? 0) + 1)
  }

  // ── Build result ─────────────────────────────────────────────────────────

  const stepStats: StepStats[] = steps.map((step) => {
    const b          = sendBuckets.get(step.id) ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, queued: 0 }
    const replyCount = replyCountByStep.get(step.id) ?? 0
    const pct        = (n: number) => (b.sent > 0 ? (n / b.sent) * 100 : 0)

    return {
      stepId:    step.id,
      position:  step.position,
      dayOffset: step.dayOffset,
      channel:   step.channel,
      subject:   step.subject,
      body:      step.body,
      totalSent: b.sent,
      delivered: b.delivered,
      opened:    b.opened,
      clicked:   b.clicked,
      failed:    b.failed,
      queued:    b.queued,
      replyCount,
      openRate:  pct(b.opened),
      clickRate: pct(b.clicked),
      replyRate: pct(replyCount),
    }
  })

  return { campaignId, steps: stepStats }
}
