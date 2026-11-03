/**
 * Everything Phantera can state about one campaign, computed from the
 * database: no model involved. Each figure comes with its source in
 * SIGNALS.md; each rate with its Wilson interval.
 *
 * Access: the campaign is read through campaignScope, so a member only
 * gets facts on their own campaigns (E0). Queries are aggregated in
 * Postgres (groupBy, parameterised SQL); nothing is loaded row by row.
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { getSendStatus, type SendStatus } from '@/lib/sequences/send-status'
import { SENT_STATUSES } from '@/lib/sequences/types'
import { messageFeatures, type MessageFeatures } from './message'
import { wilson, type Interval } from './stats'

export interface Rate { successes: number; n: number; rate: number; ci: Interval }

export function rate(successes: number, n: number): Rate {
  return { successes, n, rate: n ? successes / n : 0, ci: wilson(Math.min(successes, n), n) }
}

export interface StepFunnel {
  stepId: string
  position: number
  channel: string
  queued: number
  sending: number
  sent: number
  delivered: number
  bounced: number
  failed: number
  awaitingUser: number
  skipped: number
  /** Leads who replied to this step, by classification (classified by AI, not verified). */
  replies: { positive: number; negative: number; neutral: number; total: number }
  /** Leads who replied / messages sent at this step (one message per lead and step). */
  replyRate: Rate
  bounceRate: Rate
}

/** A segment is counted in LEADS. `unknown`: the field was empty for these leads. */
export interface Segment { value: string; unknown: boolean; leads: number; contacted: number; replied: number; replyRate: Rate }

export interface MailboxFacts {
  mailboxId: string | null
  label: string
  status: string | null
  sent: number
  bounced: number
  bounceRate: Rate
  pausedUntil: string | null
  dailyCap: number | null
}

export interface CampaignFacts {
  campaign: { id: string; name: string; status: string; ownerUserId: string; createdAt: string; senderLost: boolean }
  /** Approximated by the first send: the launch date is not stored (SIGNALS.md). */
  firstSentAt: string | null
  lastSentAt: string | null
  ageDays: number | null
  leads: { total: number; contacted: number; replied: number; anonymised: number; doNotContact: number }
  /** Leads who replied, any reply (refusals included) / leads contacted. */
  replyRate: Rate
  /** Leads with a POSITIVE reply / leads contacted. Classified by AI, not verified. */
  positiveRate: Rate
  meetings: number
  converted: number
  funnel: StepFunnel[]
  /**
   * Hours from the answered message to the reply, null under 20 replies.
   * Right-censored: replies not yet received are missing, so a young
   * campaign's delays look shorter than they are.
   */
  replyDelayHours: { median: number; p90: number; n: number } | null
  sendStatus: SendStatus
  mailboxes: MailboxFacts[]
  targeting: Record<TargetDimension, Segment[]>
  enrichment: Record<string, number>
  messages: MessageFeatures[]
  /** When Phantera sent (Europe/Paris), not when it worked: no performance by hour. */
  rhythm: Array<{ weekday: number; hour: number; sent: number }>
}

/** Under this many replies, a delay percentile is one observation, not a distribution. */
export const MIN_DELAY_SAMPLE = 20

const SENT = Prisma.raw(SENT_STATUSES.map((s) => `'${s}'`).join(','))
const ANONYMISED = 'opposition-%@invalid.phantera'

/** Columns a targeting breakdown may group by: a closed list, never user input. */
export const DIMENSIONS = {
  title:       'lower(btrim(coalesce(l."title", \'\')))',
  industry:    'lower(btrim(coalesce(l."industry", \'\')))',
  companySize: 'coalesce(l."companySize"::text, \'\')',
  country:     'lower(btrim(coalesce(l."country", \'\')))',
  scoreBadge:  'l."scoreBadge"::text',
} as const
export type TargetDimension = keyof typeof DIMENSIONS

async function funnelOf(db: PrismaClient, campaignId: string, steps: Array<{ id: string; position: number; channel: string }>): Promise<StepFunnel[]> {
  const [byStatus, replies] = await Promise.all([
    db.emailSend.groupBy({ by: ['emailStepId', 'status'], where: { campaignId }, _count: { _all: true } }),
    // Distinct leads: a reply row per lead and step, never more leads than sends.
    db.$queryRaw<Array<{ step: string; cls: string | null; n: number }>>`
      SELECT s."emailStepId" AS step, r."classification" AS cls, count(DISTINCT r."leadId")::int AS n
      FROM "EmailReply" r JOIN "EmailSend" s ON s."id" = r."emailSendId"
      WHERE r."campaignId" = ${campaignId}
      GROUP BY GROUPING SETS ((s."emailStepId", r."classification"), (s."emailStepId"))`,
  ])
  return steps.map((step) => {
    const count = (statuses: readonly string[]) => byStatus
      .filter((g) => g.emailStepId === step.id && statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count._all, 0)
    const r = (cls: string) => replies.find((x) => x.step === step.id && x.cls === cls)?.n ?? 0
    const sent = count(SENT_STATUSES)
    const bounced = count(['BOUNCED'])
    // The grouping-set row without classification: distinct replying leads.
    const total = replies.find((x) => x.step === step.id && x.cls === null)?.n ?? 0
    return {
      stepId: step.id, position: step.position, channel: step.channel,
      queued: count(['PENDING']), sending: count(['SENDING']), sent, delivered: count(['DELIVERED', 'OPENED', 'CLICKED']),
      bounced, failed: count(['FAILED']), awaitingUser: count(['AWAITING_USER']), skipped: count(['SKIPPED']),
      replies: { positive: r('POSITIVE'), negative: r('NEGATIVE'), neutral: r('NEUTRAL'), total },
      replyRate: rate(total, sent),
      // Bounces are counted against what was attempted: sent + bounced.
      bounceRate: rate(bounced, sent + bounced),
    }
  })
}

async function segmentsOf(db: PrismaClient, campaignId: string, dimension: TargetDimension): Promise<Segment[]> {
  const column = Prisma.raw(DIMENSIONS[dimension])
  const rows = await db.$queryRaw<Array<{ value: string; leads: number; contacted: number; replied: number }>>`
    SELECT ${column} AS value,
           count(DISTINCT l."id")::int AS leads,
           count(DISTINCT s."leadId")::int AS contacted,
           count(DISTINCT r."leadId")::int AS replied
    FROM "Lead" l
    LEFT JOIN "EmailSend" s ON s."leadId" = l."id" AND s."campaignId" = ${campaignId} AND s."status"::text IN (${SENT})
    LEFT JOIN "EmailReply" r ON r."leadId" = l."id" AND r."campaignId" = ${campaignId}
    WHERE l."campaignId" = ${campaignId} AND l."email" NOT LIKE ${ANONYMISED}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 15`
  return rows.map((row) => ({ ...row, value: row.value || '(non renseigné)', unknown: !row.value, replyRate: rate(row.replied, row.contacted) }))
}

async function mailboxesOf(db: PrismaClient, campaignId: string, workspaceId: string): Promise<MailboxFacts[]> {
  const groups = await db.emailSend.groupBy({ by: ['mailboxId', 'status'], where: { campaignId }, _count: { _all: true } })
  const ids = [...new Set(groups.map((g) => g.mailboxId).filter((id): id is string => id !== null))]
  const boxes = ids.length
    ? await db.connectedMailbox.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true, email: true, status: true, sendPausedUntil: true, dailyCap: true } })
    : []
  const keys = [...new Set(groups.map((g) => g.mailboxId))]
  return keys.map((mailboxId) => {
    const of = (statuses: readonly string[]) => groups.filter((g) => g.mailboxId === mailboxId && statuses.includes(g.status)).reduce((s, g) => s + g._count._all, 0)
    const box = boxes.find((b) => b.id === mailboxId)
    const sent = of(SENT_STATUSES)
    const bounced = of(['BOUNCED'])
    return {
      mailboxId,
      label: box?.email ?? (mailboxId ? 'boîte supprimée' : 'domaine partagé Phantera'),
      status: box?.status ?? null,
      sent, bounced, bounceRate: rate(bounced, sent + bounced),
      pausedUntil: box?.sendPausedUntil?.toISOString() ?? null,
      dailyCap: box?.dailyCap ?? null,
    }
  })
}

/** Null when the caller does not see this campaign. */
export async function getCampaignFacts(db: PrismaClient, scope: Scope, campaignId: string, now = new Date()): Promise<CampaignFacts | null> {
  const campaign = await db.campaign.findFirst({
    where:  { id: campaignId, ...campaignScope(scope) },
    select: {
      id: true, name: true, status: true, ownerUserId: true, createdAt: true, senderLostAt: true, workspaceId: true,
      emailSteps: { select: { id: true, position: true, dayOffset: true, channel: true, subject: true, body: true }, orderBy: { position: 'asc' } },
    },
  })
  if (!campaign) return null

  const [funnel, span, delay, leadCounts, meetings, mailboxes, sendStatus, enrichment, rhythm, ...segments] = await Promise.all([
    funnelOf(db, campaign.id, campaign.emailSteps),
    db.$queryRaw<Array<{ first: Date | null; last: Date | null }>>`
      SELECT min("sentAt") AS first, max("sentAt") AS last FROM "EmailSend"
      WHERE "campaignId" = ${campaign.id} AND "sentAt" IS NOT NULL`,
    db.$queryRaw<Array<{ median: number | null; p90: number | null; n: number }>>`
      SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r."receivedAt" - s."sentAt")) / 3600) AS median,
             percentile_disc(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r."receivedAt" - s."sentAt")) / 3600) AS p90,
             count(*)::int AS n
      FROM "EmailReply" r JOIN "EmailSend" s ON s."id" = r."emailSendId"
      WHERE r."campaignId" = ${campaign.id} AND s."sentAt" IS NOT NULL AND r."receivedAt" >= s."sentAt"`,
    db.$queryRaw<Array<{ total: number; contacted: number; replied: number; positive: number; anonymised: number; dnc: number; converted: number }>>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "EmailReply" r WHERE r."leadId" = l."id" AND r."campaignId" = ${campaign.id} AND r."classification" = 'POSITIVE'))::int AS positive,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "EmailSend" s WHERE s."leadId" = l."id" AND s."campaignId" = ${campaign.id} AND s."status"::text IN (${SENT})))::int AS contacted,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "EmailReply" r WHERE r."leadId" = l."id" AND r."campaignId" = ${campaign.id}))::int AS replied,
             count(*) FILTER (WHERE l."email" LIKE ${ANONYMISED})::int AS anonymised,
             count(*) FILTER (WHERE l."doNotContact")::int AS dnc,
             count(*) FILTER (WHERE l."status" = 'converted')::int AS converted
      FROM "Lead" l WHERE l."campaignId" = ${campaign.id}`,
    db.notification.count({ where: { workspaceId: campaign.workspaceId, campaignId: campaign.id, type: 'LEAD_REPLIED_MEETING' } }),
    mailboxesOf(db, campaign.id, campaign.workspaceId),
    getSendStatus(db, { workspaceId: campaign.workspaceId, campaignId: campaign.id, campaignActive: campaign.status === 'ACTIVE' }),
    db.$queryRaw<Array<{ status: string; n: number }>>`
      SELECT coalesce(e."emailStatus", 'non vérifié') AS status, count(*)::int AS n
      FROM "Lead" l LEFT JOIN "LeadEnrichment" e ON e."leadId" = l."id"
      WHERE l."campaignId" = ${campaign.id} AND l."email" NOT LIKE ${ANONYMISED}
      GROUP BY 1`,
    db.$queryRaw<Array<{ weekday: number; hour: number; sent: number }>>`
      SELECT EXTRACT(ISODOW FROM ("sentAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::int AS weekday,
             EXTRACT(HOUR FROM ("sentAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::int AS hour,
             count(*)::int AS sent
      FROM "EmailSend" WHERE "campaignId" = ${campaign.id} AND "sentAt" IS NOT NULL
      GROUP BY 1, 2 ORDER BY 1, 2`,
    ...(Object.keys(DIMENSIONS) as TargetDimension[]).map((d) => segmentsOf(db, campaign.id, d)),
  ])

  const first = span[0]?.first ?? null
  const counts = leadCounts[0]
  const d = delay[0]
  return {
    campaign: {
      id: campaign.id, name: campaign.name, status: campaign.status, ownerUserId: campaign.ownerUserId,
      createdAt: campaign.createdAt.toISOString(), senderLost: Boolean(campaign.senderLostAt),
    },
    firstSentAt: first?.toISOString() ?? null,
    lastSentAt: span[0]?.last?.toISOString() ?? null,
    ageDays: first ? (now.getTime() - first.getTime()) / 86_400_000 : null,
    leads: { total: counts.total, contacted: counts.contacted, replied: counts.replied, anonymised: counts.anonymised, doNotContact: counts.dnc },
    replyRate: rate(counts.replied, counts.contacted),
    positiveRate: rate(counts.positive, counts.contacted),
    meetings,
    converted: counts.converted,
    funnel,
    replyDelayHours: d && d.n >= MIN_DELAY_SAMPLE && d.median !== null && d.p90 !== null ? { median: Number(d.median), p90: Number(d.p90), n: d.n } : null,
    sendStatus,
    mailboxes,
    targeting: Object.fromEntries((Object.keys(DIMENSIONS) as TargetDimension[]).map((k, i) => [k, segments[i]])) as Record<TargetDimension, Segment[]>,
    enrichment: Object.fromEntries(enrichment.map((e) => [e.status, e.n])),
    messages: messageFeatures(campaign.emailSteps),
    rhythm,
  }
}
