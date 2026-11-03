/**
 * The signals over time the alerts need beyond a campaign's facts: how old
 * the queue is, the bounces of the last days, and the reply at J+7 of two
 * successive periods. Aggregated SQL, three queries per campaign.
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import { SENT_STATUSES } from '@/lib/sequences/types'
import { cohortRows } from '@/lib/analytics/queries'
import { BOUNCE_WINDOW_DAYS, type CampaignSignals } from './detect'
import { DIMENSIONS } from '@/lib/analyst/facts/campaign'
import { SEGMENT_DIMENSIONS, type PendingBySegment } from './detect-opportunities'

const SENT = Prisma.raw(SENT_STATUSES.map((s) => `'${s}'`).join(','))
const DAY = 86_400_000

/** Leads first contacted 7 to 21 days ago (recent) and 21 to 49 days ago (before): both mature at J+7. */
export const RECENT_DAYS = 21
export const BEFORE_DAYS = 49

export async function campaignSignals(db: PrismaClient, campaignId: string, now: Date): Promise<CampaignSignals> {
  const since = new Date(now.getTime() - BOUNCE_WINDOW_DAYS * DAY)
  const [pending, bounces, cohorts, senderChange] = await Promise.all([
    db.emailSend.findFirst({ where: { campaignId, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.$queryRaw<Array<{ attempted: number; bounced: number }>>`
      -- Attempted = sent + bounced, as in the facts engine (SENT_STATUSES leaves bounces out).
      SELECT count(*) FILTER (WHERE s."status"::text IN (${SENT}) OR s."status"::text = 'BOUNCED')::int AS attempted,
             count(*) FILTER (WHERE s."status"::text = 'BOUNCED')::int AS bounced
      FROM "EmailSend" s
      WHERE s."campaignId" = ${campaignId} AND coalesce(s."sentAt", s."createdAt") >= ${since}::timestamp`,
    cohortRows(db, [campaignId], new Date(now.getTime() - BEFORE_DAYS * DAY), now),
    db.insightAction.findFirst({ where: { campaignId, action: 'change_sender', revertedAt: null }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ])
  const cut = new Date(now.getTime() - RECENT_DAYS * DAY).toISOString().slice(0, 10)
  const sum = (rows: typeof cohorts) => rows.reduce((a, r) => ({ replied: a.replied + r.replied, mature: a.mature + r.mature }), { replied: 0, mature: 0 })
  const b = bounces[0] ?? { attempted: 0, bounced: 0 }
  return {
    oldestPendingAt: pending?.createdAt ?? null,
    senderChangedAt: senderChange?.createdAt ?? null,
    recentBounces: { attempted: b.attempted, bounced: b.bounced },
    replies: { recent: sum(cohorts.filter((r) => r.day >= cut)), before: sum(cohorts.filter((r) => r.day < cut)) },
  }
}

/**
 * First messages still waiting, per segment value (the facts engine's own
 * expressions, a closed list). Only the first step: follow-ups belong to
 * leads already contacted, who are not taken off.
 */
export async function pendingFirstBySegment(db: PrismaClient, campaignId: string): Promise<PendingBySegment> {
  const [i, sz, co, b] = SEGMENT_DIMENSIONS.map((d) => Prisma.raw(DIMENSIONS[d]))
  const rows = await db.$queryRaw<Array<{ g: number; i: string | null; sz: string | null; co: string | null; b: string | null; n: number }>>`
    SELECT GROUPING(${i}, ${sz}, ${co}, ${b})::int AS g, ${i} AS i, ${sz} AS sz, ${co} AS co, ${b} AS b, count(*)::int AS n
    FROM "EmailSend" s
    JOIN "CampaignEmailStep" st ON st."id" = s."emailStepId"
    JOIN "Lead" l ON l."id" = s."leadId"
    WHERE s."campaignId" = ${campaignId} AND s."status"::text = 'PENDING'
      AND st."position" = (SELECT min(x."position") FROM "CampaignEmailStep" x WHERE x."campaignId" = ${campaignId})
    GROUP BY GROUPING SETS ((${i}), (${sz}), (${co}), (${b}))`
  const out: PendingBySegment = { industry: new Map(), companySize: new Map(), country: new Map(), scoreBadge: new Map() }
  // GROUPING bits, first argument highest: 7 = industry, 11 = size, 13 = country, 14 = badge.
  for (const r of rows) {
    if (r.g === 7 && r.i) out.industry.set(r.i, r.n)
    else if (r.g === 11 && r.sz) out.companySize.set(r.sz, r.n)
    else if (r.g === 13 && r.co) out.country.set(r.co, r.n)
    else if (r.g === 14 && r.b) out.scoreBadge.set(r.b, r.n)
  }
  return out
}
