/**
 * Analytics, the counting part: aggregated SQL only (counts per day, step,
 * mailbox), never rows loaded into Node. Rates, intervals and tests are
 * computed from these counts in build.ts.
 *
 * The unit is the lead, in the campaign it belongs to now (a lead moved
 * elsewhere takes its history with it). A lead's cohort is the day of its
 * first message sent; it "replied at J+7" if a reply came within 7 days.
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import { SENT_STATUSES } from '@/lib/sequences/types'
import { REPLY_WINDOW_DAYS } from './filters'

const SENT = Prisma.raw(SENT_STATUSES.map((s) => `'${s}'`).join(','))
const WINDOW = Prisma.raw(`interval '${REPLY_WINDOW_DAYS} days'`)

type Db = Pick<PrismaClient, '$queryRaw'>

/** One campaign, one Paris day of first contacts. */
export interface CohortRow {
  campaignId: string
  day: string // YYYY-MM-DD, Europe/Paris
  contacted: number
  /** First contacted at least REPLY_WINDOW_DAYS ago: their J+7 outcome is known. */
  mature: number
  replied: number
  positive: number
}

export async function cohortRows(db: Db, campaignIds: string[], since: Date, now: Date): Promise<CohortRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<CohortRow[]>`
    WITH first AS (
      SELECT s."leadId", s."campaignId", min(s."sentAt") AS first_sent
      FROM "EmailSend" s
      JOIN "Lead" l ON l."id" = s."leadId" AND l."campaignId" = s."campaignId"
      WHERE s."campaignId" = ANY(${campaignIds}::text[]) AND s."sentAt" IS NOT NULL AND s."status"::text IN (${SENT})
      GROUP BY s."leadId", s."campaignId"
    ),
    rep AS (
      SELECT r."leadId", r."campaignId", min(r."receivedAt") AS first_reply,
             min(r."receivedAt") FILTER (WHERE r."classification" = 'POSITIVE') AS first_positive
      FROM "EmailReply" r
      WHERE r."campaignId" = ANY(${campaignIds}::text[])
      GROUP BY r."leadId", r."campaignId"
    )
    SELECT f."campaignId",
           to_char(f.first_sent AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
           count(*)::int AS contacted,
           count(*) FILTER (WHERE f.first_sent <= ${now}::timestamp - ${WINDOW})::int AS mature,
           count(*) FILTER (WHERE f.first_sent <= ${now}::timestamp - ${WINDOW} AND r.first_reply >= f.first_sent AND r.first_reply <= f.first_sent + ${WINDOW})::int AS replied,
           count(*) FILTER (WHERE f.first_sent <= ${now}::timestamp - ${WINDOW} AND r.first_positive >= f.first_sent AND r.first_positive <= f.first_sent + ${WINDOW})::int AS positive
    FROM first f
    LEFT JOIN rep r ON r."leadId" = f."leadId" AND r."campaignId" = f."campaignId"
    WHERE f.first_sent >= ${since}::timestamp AND f.first_sent < ${now}::timestamp
    GROUP BY f."campaignId", day`
}

/** Per sequence step, for the leads first contacted in the period. */
export interface StepRow { position: number; channel: string; reached: number; bounced: number; replied: number; positive: number }

export async function stepRows(db: Db, campaignIds: string[], from: Date, now: Date): Promise<StepRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<StepRow[]>`
    WITH cohort AS (
      SELECT s."leadId", s."campaignId"
      FROM "EmailSend" s
      JOIN "Lead" l ON l."id" = s."leadId" AND l."campaignId" = s."campaignId"
      WHERE s."campaignId" = ANY(${campaignIds}::text[]) AND s."sentAt" IS NOT NULL AND s."status"::text IN (${SENT})
      GROUP BY s."leadId", s."campaignId"
      HAVING min(s."sentAt") >= ${from}::timestamp AND min(s."sentAt") < ${now}::timestamp
    )
    SELECT st."position"::int AS position, st."channel"::text AS channel,
           count(DISTINCT s."leadId") FILTER (WHERE s."status"::text IN (${SENT}))::int AS reached,
           count(DISTINCT s."leadId") FILTER (WHERE s."status"::text = 'BOUNCED')::int AS bounced,
           count(DISTINCT r."leadId")::int AS replied,
           count(DISTINCT r."leadId") FILTER (WHERE r."classification" = 'POSITIVE')::int AS positive
    FROM "EmailSend" s
    JOIN cohort c ON c."leadId" = s."leadId" AND c."campaignId" = s."campaignId"
    JOIN "CampaignEmailStep" st ON st."id" = s."emailStepId"
    LEFT JOIN "EmailReply" r ON r."emailSendId" = s."id"
    GROUP BY st."position", st."channel"
    ORDER BY st."position"`
}

/** Per sending mailbox and Paris week: emails sent, bounced, failed. */
export interface MailboxRow { mailboxId: string; week: string; sent: number; bounced: number; failed: number }

export async function mailboxRows(db: Db, campaignIds: string[], since: Date, now: Date): Promise<MailboxRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<MailboxRow[]>`
    SELECT s."mailboxId",
           to_char(date_trunc('week', coalesce(s."sentAt", s."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD') AS week,
           count(*) FILTER (WHERE s."status"::text IN (${SENT}))::int AS sent,
           count(*) FILTER (WHERE s."status"::text = 'BOUNCED')::int AS bounced,
           count(*) FILTER (WHERE s."status"::text = 'FAILED')::int AS failed
    FROM "EmailSend" s
    JOIN "CampaignEmailStep" st ON st."id" = s."emailStepId" AND st."channel"::text = 'EMAIL'
    WHERE s."campaignId" = ANY(${campaignIds}::text[]) AND s."mailboxId" IS NOT NULL
      AND coalesce(s."sentAt", s."createdAt") >= ${since}::timestamp AND coalesce(s."sentAt", s."createdAt") < ${now}::timestamp
    GROUP BY s."mailboxId", week`
}

/** Shared CTE: each lead's first message and first reply in its own campaign. */
function leadTimes(campaignIds: string[]) {
  return Prisma.sql`
    first AS (
      SELECT s."leadId", s."campaignId", min(s."sentAt") AS first_sent
      FROM "EmailSend" s
      JOIN "Lead" l ON l."id" = s."leadId" AND l."campaignId" = s."campaignId"
      WHERE s."campaignId" = ANY(${campaignIds}::text[]) AND s."sentAt" IS NOT NULL AND s."status"::text IN (${SENT})
      GROUP BY s."leadId", s."campaignId"
    ),
    rep AS (
      SELECT r."leadId", r."campaignId", min(r."receivedAt") AS first_reply
      FROM "EmailReply" r WHERE r."campaignId" = ANY(${campaignIds}::text[])
      GROUP BY r."leadId", r."campaignId"
    )`
}

/** Days from first contact to first reply (event) or to now (censored), capped at `capDays`. */
export interface DelayRow { day: number; events: number; censored: number }

export async function delayRows(db: Db, campaignIds: string[], from: Date, now: Date, capDays = 30): Promise<DelayRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<DelayRow[]>`
    WITH ${leadTimes(campaignIds)},
    obs AS (
      SELECT CASE WHEN r.first_reply IS NOT NULL AND r.first_reply >= f.first_sent
                  THEN floor(extract(epoch FROM (r.first_reply - f.first_sent)) / 86400)
                  ELSE floor(extract(epoch FROM (${now}::timestamp - f.first_sent)) / 86400) END AS raw_day,
             (r.first_reply IS NOT NULL AND r.first_reply >= f.first_sent) AS replied
      FROM first f LEFT JOIN rep r ON r."leadId" = f."leadId" AND r."campaignId" = f."campaignId"
      WHERE f.first_sent >= ${from}::timestamp AND f.first_sent < ${now}::timestamp
    )
    SELECT least(raw_day, ${capDays})::int AS day,
           count(*) FILTER (WHERE replied AND raw_day <= ${capDays})::int AS events,
           count(*) FILTER (WHERE NOT replied OR raw_day > ${capDays})::int AS censored
    FROM obs GROUP BY 1 ORDER BY 1`
}

/** Per score badge: mature leads first contacted in the period, and those who replied within 7 days. */
export interface BadgeRow { badge: string; mature: number; replied: number }

export async function badgeRows(db: Db, campaignIds: string[], from: Date, now: Date): Promise<BadgeRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<BadgeRow[]>`
    WITH ${leadTimes(campaignIds)}
    SELECT l."scoreBadge"::text AS badge,
           count(*)::int AS mature,
           count(*) FILTER (WHERE r.first_reply >= f.first_sent AND r.first_reply <= f.first_sent + ${WINDOW})::int AS replied
    FROM first f
    JOIN "Lead" l ON l."id" = f."leadId"
    LEFT JOIN rep r ON r."leadId" = f."leadId" AND r."campaignId" = f."campaignId"
    WHERE f.first_sent >= ${from}::timestamp AND f.first_sent <= ${now}::timestamp - ${WINDOW}
    GROUP BY 1`
}

/** Replies per Paris week and classification, in distinct leads. */
export interface ClassRow { week: string; classification: string; leads: number }

export async function classificationRows(db: Db, campaignIds: string[], since: Date, now: Date): Promise<ClassRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<ClassRow[]>`
    SELECT to_char(date_trunc('week', r."receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD') AS week,
           coalesce(r."classification"::text, 'NEUTRAL') AS classification,
           count(DISTINCT r."leadId")::int AS leads
    FROM "EmailReply" r
    JOIN "Lead" l ON l."id" = r."leadId" AND l."campaignId" = r."campaignId"
    WHERE r."campaignId" = ANY(${campaignIds}::text[]) AND r."receivedAt" >= ${since}::timestamp AND r."receivedAt" < ${now}::timestamp
    GROUP BY 1, 2`
}

/** Sends and replies per Paris weekday (1 = Monday) and hour. */
export interface HourRow { dow: number; hour: number; sent: number; replied: number }

export async function hourRows(db: Db, campaignIds: string[], from: Date, now: Date): Promise<HourRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<HourRow[]>`
    WITH sends AS (
      SELECT extract(isodow FROM s."sentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::int AS dow,
             extract(hour FROM s."sentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::int AS hour,
             count(*)::int AS n
      FROM "EmailSend" s
      WHERE s."campaignId" = ANY(${campaignIds}::text[]) AND s."status"::text IN (${SENT})
        AND s."sentAt" >= ${from}::timestamp AND s."sentAt" < ${now}::timestamp
      GROUP BY 1, 2
    ),
    replies AS (
      SELECT extract(isodow FROM r."receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::int AS dow,
             extract(hour FROM r."receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::int AS hour,
             count(DISTINCT r."leadId")::int AS n
      FROM "EmailReply" r
      WHERE r."campaignId" = ANY(${campaignIds}::text[]) AND r."receivedAt" >= ${from}::timestamp AND r."receivedAt" < ${now}::timestamp
      GROUP BY 1, 2
    )
    SELECT coalesce(s.dow, r.dow) AS dow, coalesce(s.hour, r.hour) AS hour,
           coalesce(s.n, 0) AS sent, coalesce(r.n, 0) AS replied
    FROM sends s FULL OUTER JOIN replies r ON r.dow = s.dow AND r.hour = s.hour`
}

/** Per step channel: leads reached, and leads who replied to a message of that channel. */
export interface ChannelRow { channel: string; reached: number; replied: number }

export async function channelRows(db: Db, campaignIds: string[], from: Date, now: Date): Promise<ChannelRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<ChannelRow[]>`
    SELECT st."channel"::text AS channel,
           count(DISTINCT s."leadId") FILTER (WHERE s."status"::text IN (${SENT}))::int AS reached,
           count(DISTINCT r."leadId")::int AS replied
    FROM "EmailSend" s
    JOIN "CampaignEmailStep" st ON st."id" = s."emailStepId"
    JOIN "Lead" l ON l."id" = s."leadId" AND l."campaignId" = s."campaignId"
    LEFT JOIN "EmailReply" r ON r."emailSendId" = s."id"
    WHERE s."campaignId" = ANY(${campaignIds}::text[]) AND s."sentAt" >= ${from}::timestamp AND s."sentAt" < ${now}::timestamp
    GROUP BY 1`
}

/** Leads anonymised after an objection: no title nor company left to segment on. */
const ANONYMISED = 'opposition-%@invalid.phantera'

/**
 * Mature leads (first contact in the period, at least 7 days ago) and those
 * who replied within 7 days, by title, industry, size, country, and by
 * title × industry. Titles come back raw (lower-cased): their level is read
 * in build.ts. `set` names the grouping.
 */
export interface SegmentRow {
  set: 'title' | 'industry' | 'companySize' | 'country' | 'titleIndustry'
  title: string | null; industry: string | null; companySize: string | null; country: string | null
  /** As typed (one of the spellings): "SaaS", not the lower-cased key. */
  industryLabel?: string | null; countryLabel?: string | null
  mature: number; replied: number
}

const SETS: Record<number, SegmentRow['set']> = { 7: 'title', 11: 'industry', 13: 'companySize', 14: 'country', 3: 'titleIndustry' }

export async function segmentRows(db: Db, campaignIds: string[], from: Date, now: Date): Promise<SegmentRow[]> {
  if (campaignIds.length === 0) return []
  const rows = await db.$queryRaw<Array<Omit<SegmentRow, 'set'> & { g: number }>>`
    WITH ${leadTimes(campaignIds)},
    m AS (
      SELECT lower(btrim(coalesce(l."title", ''))) AS t, lower(btrim(coalesce(l."industry", ''))) AS i,
             coalesce(l."companySize"::text, '') AS sz, lower(btrim(coalesce(l."country", ''))) AS co,
             btrim(l."industry") AS il, btrim(l."country") AS cl,
             (r.first_reply >= f.first_sent AND r.first_reply <= f.first_sent + ${WINDOW}) AS replied
      FROM first f
      JOIN "Lead" l ON l."id" = f."leadId"
      LEFT JOIN rep r ON r."leadId" = f."leadId" AND r."campaignId" = f."campaignId"
      WHERE f.first_sent >= ${from}::timestamp AND f.first_sent <= ${now}::timestamp - ${WINDOW}
        AND l."email" NOT LIKE ${ANONYMISED}
    )
    SELECT GROUPING(t, i, sz, co)::int AS g, t AS title, i AS industry, sz AS "companySize", co AS country,
           max(il) AS "industryLabel", max(cl) AS "countryLabel",
           count(*)::int AS mature, count(*) FILTER (WHERE replied)::int AS replied
    FROM m
    GROUP BY GROUPING SETS ((t), (i), (sz), (co), (t, i))`
  return rows.flatMap(({ g, ...r }) => (SETS[g] ? [{ ...r, set: SETS[g] }] : []))
}

/** Reply checkpoints of the cohort triangle, in days after the first contact. */
export const TRIANGLE_DAYS = [3, 7, 14, 30] as const

/** Per Paris week of first contact: leads old enough for each checkpoint, and those who had replied by then. */
export interface TriangleRow { week: string; contacted: number; mature: number[]; replied: number[] }

export async function triangleRows(db: Db, campaignIds: string[], since: Date, now: Date): Promise<TriangleRow[]> {
  if (campaignIds.length === 0) return []
  const [d1, d2, d3, d4] = TRIANGLE_DAYS.map((d) => Prisma.raw(`interval '${d} days'`))
  const rows = await db.$queryRaw<Array<{ week: string; contacted: number; m1: number; m2: number; m3: number; m4: number; r1: number; r2: number; r3: number; r4: number }>>`
    WITH ${leadTimes(campaignIds)},
    x AS (
      SELECT f.first_sent AS s, r.first_reply AS fr FROM first f
      LEFT JOIN rep r ON r."leadId" = f."leadId" AND r."campaignId" = f."campaignId"
      WHERE f.first_sent >= ${since}::timestamp AND f.first_sent < ${now}::timestamp
    )
    SELECT to_char(date_trunc('week', s AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD') AS week,
           count(*)::int AS contacted,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d1})::int AS m1,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d2})::int AS m2,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d3})::int AS m3,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d4})::int AS m4,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d1} AND fr >= s AND fr <= s + ${d1})::int AS r1,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d2} AND fr >= s AND fr <= s + ${d2})::int AS r2,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d3} AND fr >= s AND fr <= s + ${d3})::int AS r3,
           count(*) FILTER (WHERE s <= ${now}::timestamp - ${d4} AND fr >= s AND fr <= s + ${d4})::int AS r4
    FROM x GROUP BY 1 ORDER BY 1`
  return rows.map((r) => ({ week: r.week, contacted: r.contacted, mature: [r.m1, r.m2, r.m3, r.m4], replied: [r.r1, r.r2, r.r3, r.r4] }))
}

/**
 * The pipeline of the leads first contacted in the period: replied, showed
 * interest (a positive reply or qualified by hand), asked for a meeting,
 * converted (set by hand), with the median days from first contact to each.
 */
export interface PipelineRow {
  contacted: number; replied: number; interested: number; meeting: number; won: number
  daysToReply: number | null; daysToInterest: number | null; daysToWon: number | null
}

export async function pipelineRow(db: Db, campaignIds: string[], from: Date, now: Date): Promise<PipelineRow | null> {
  if (campaignIds.length === 0) return null
  const rows = await db.$queryRaw<PipelineRow[]>`
    WITH ${leadTimes(campaignIds)},
    cls AS (
      SELECT r."leadId", r."campaignId",
             min(r."receivedAt") FILTER (WHERE r."classification" IN ('POSITIVE', 'MEETING_REQUEST')) AS first_positive,
             bool_or(r."classification" = 'MEETING_REQUEST') AS meeting
      FROM "EmailReply" r WHERE r."campaignId" = ANY(${campaignIds}::text[])
      GROUP BY r."leadId", r."campaignId"
    ),
    p AS (
      SELECT f.first_sent AS s,
             CASE WHEN r.first_reply >= f.first_sent THEN r.first_reply END AS replied_at,
             CASE WHEN c.first_positive >= f.first_sent THEN c.first_positive
                  WHEN l."qualifiedAt" >= f.first_sent THEN l."qualifiedAt" END AS interest_at,
             coalesce(c.meeting, false) AS meeting,
             CASE WHEN l."wonAt" >= f.first_sent THEN l."wonAt" END AS won_at
      FROM first f
      JOIN "Lead" l ON l."id" = f."leadId"
      LEFT JOIN rep r ON r."leadId" = f."leadId" AND r."campaignId" = f."campaignId"
      LEFT JOIN cls c ON c."leadId" = f."leadId" AND c."campaignId" = f."campaignId"
      WHERE f.first_sent >= ${from}::timestamp AND f.first_sent < ${now}::timestamp
    )
    SELECT count(*)::int AS contacted,
           count(replied_at)::int AS replied,
           count(interest_at)::int AS interested,
           count(*) FILTER (WHERE meeting)::int AS meeting,
           count(won_at)::int AS won,
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM replied_at - s) / 86400))::float AS "daysToReply",
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM interest_at - s) / 86400))::float AS "daysToInterest",
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM won_at - s) / 86400))::float AS "daysToWon"
    FROM p`
  return rows[0] ?? null
}

/** Status changes of the campaigns (lib/analytics/annotations), with their Paris week. */
export interface StatusEventRow { campaignId: string; fromStatus: string | null; toStatus: string; at: Date; week: string }

export async function statusEventRows(db: Db, campaignIds: string[], since: Date, now: Date): Promise<StatusEventRow[]> {
  if (campaignIds.length === 0) return []
  return db.$queryRaw<StatusEventRow[]>`
    SELECT e."campaignId", e."fromStatus"::text AS "fromStatus", e."toStatus"::text AS "toStatus", e."at",
           to_char(date_trunc('week', e."at" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD') AS week
    FROM "CampaignStatusEvent" e
    WHERE e."campaignId" = ANY(${campaignIds}::text[]) AND e."at" >= ${since}::timestamp AND e."at" < ${now}::timestamp
    ORDER BY e."at"`
}
