/**
 * The figures of a campaign, as every screen shows them: list, detail, home.
 * One source of truth, the rows themselves, with the definitions of the
 * facts engine (lib/analyst/facts/campaign.ts):
 *
 *   contacted   leads of the campaign with at least one message sent
 *   replied     leads of the campaign with a reply, refusals included
 *   reply rate  replied / contacted (the lead is the unit, not the message)
 *   messages    sent messages, per channel (email, LinkedIn, SMS, WhatsApp…)
 *   open rate   email only: opened / sent emails; an estimate (privacy
 *               proxies open on their own, scanners click)
 *   bounces     bounced / (sent + bounced) emails
 *
 * The counters stored on Campaign (sentCount, openCount, replyCount) drift:
 * bumped in many places, never corrected, refusals skipped, bounces kept.
 * Nothing here reads them.
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import { SENT_STATUSES } from '@/lib/sequences/types'
import { rate, type Rate } from '@/lib/analyst/facts/campaign'

export interface CampaignMetrics {
  leads: number
  contacted: number
  replied: number
  positive: number
  converted: number
  replyRate: Rate
  positiveRate: Rate
  conversionRate: Rate
  messages: { total: number; byChannel: Record<string, number> }
  email: { sent: number; opened: number; bounced: number; openRate: Rate; bounceRate: Rate }
}

const SENT = Prisma.raw(SENT_STATUSES.map((s) => `'${s}'`).join(','))

type Db = Pick<PrismaClient, '$queryRaw'>

export function emptyMetrics(): CampaignMetrics {
  return build({ leads: 0, contacted: 0, replied: 0, positive: 0, converted: 0 }, [])
}

function build(l: { leads: number; contacted: number; replied: number; positive: number; converted: number }, channels: Array<{ ch: string; sent: number; opened: number; bounced: number }>): CampaignMetrics {
  const byChannel: Record<string, number> = {}
  let total = 0
  for (const c of channels) { if (c.sent) { byChannel[c.ch] = (byChannel[c.ch] ?? 0) + c.sent; total += c.sent } }
  const email = channels.filter((c) => c.ch === 'EMAIL').reduce((a, c) => ({ sent: a.sent + c.sent, opened: a.opened + c.opened, bounced: a.bounced + c.bounced }), { sent: 0, opened: 0, bounced: 0 })
  return {
    ...l,
    replyRate: rate(l.replied, l.contacted),
    positiveRate: rate(l.positive, l.contacted),
    conversionRate: rate(l.converted, l.leads),
    messages: { total, byChannel },
    email: { ...email, openRate: rate(email.opened, email.sent), bounceRate: rate(email.bounced, email.sent + email.bounced) },
  }
}

/** Figures of many campaigns in two grouped queries, whatever their number. */
export async function getCampaignMetrics(db: Db, campaignIds: string[]): Promise<Map<string, CampaignMetrics>> {
  const out = new Map<string, CampaignMetrics>()
  if (campaignIds.length === 0) return out
  const [leads, channels] = await Promise.all([
    db.$queryRaw<Array<{ cid: string; leads: number; contacted: number; replied: number; positive: number; converted: number }>>`
      SELECT l."campaignId" AS cid,
             count(*)::int AS leads,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "EmailSend" s WHERE s."leadId" = l."id" AND s."campaignId" = l."campaignId" AND s."status"::text IN (${SENT})))::int AS contacted,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "EmailReply" r WHERE r."leadId" = l."id" AND r."campaignId" = l."campaignId"))::int AS replied,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "EmailReply" r WHERE r."leadId" = l."id" AND r."campaignId" = l."campaignId" AND r."classification" = 'POSITIVE'))::int AS positive,
             count(*) FILTER (WHERE l."status" = 'converted')::int AS converted
      FROM "Lead" l
      WHERE l."campaignId" = ANY(${campaignIds}::text[])
      GROUP BY l."campaignId"`,
    // Messages of leads still in the campaign: a lead moved elsewhere takes
    // its history with it (it made "78 / 69 leads contactés" possible).
    db.$queryRaw<Array<{ cid: string; ch: string; sent: number; opened: number; bounced: number }>>`
      SELECT s."campaignId" AS cid, st."channel"::text AS ch,
             count(*) FILTER (WHERE s."status"::text IN (${SENT}))::int AS sent,
             count(*) FILTER (WHERE s."status"::text IN (${SENT}) AND (s."status"::text IN ('OPENED', 'CLICKED') OR s."openedAt" IS NOT NULL))::int AS opened,
             count(*) FILTER (WHERE s."status"::text = 'BOUNCED')::int AS bounced
      FROM "EmailSend" s
      JOIN "CampaignEmailStep" st ON st."id" = s."emailStepId"
      JOIN "Lead" l ON l."id" = s."leadId" AND l."campaignId" = s."campaignId"
      WHERE s."campaignId" = ANY(${campaignIds}::text[])
      GROUP BY s."campaignId", st."channel"`,
  ])
  const byCampaign = new Map<string, Array<{ ch: string; sent: number; opened: number; bounced: number }>>()
  for (const c of channels) byCampaign.set(c.cid, [...(byCampaign.get(c.cid) ?? []), c])
  for (const id of campaignIds) {
    const l = leads.find((x) => x.cid === id) ?? { leads: 0, contacted: 0, replied: 0, positive: 0, converted: 0 }
    out.set(id, build(l, byCampaign.get(id) ?? []))
  }
  return out
}

/** Pooled figures of several campaigns: sums, never a mean of rates. */
export function poolMetrics(list: CampaignMetrics[]): CampaignMetrics {
  const sum = (f: (m: CampaignMetrics) => number) => list.reduce((a, m) => a + f(m), 0)
  const channels: Array<{ ch: string; sent: number; opened: number; bounced: number }> = []
  for (const m of list) {
    for (const [ch, n] of Object.entries(m.messages.byChannel)) {
      channels.push({ ch, sent: n, opened: ch === 'EMAIL' ? m.email.opened : 0, bounced: ch === 'EMAIL' ? m.email.bounced : 0 })
    }
    if (!m.messages.byChannel.EMAIL && m.email.bounced) channels.push({ ch: 'EMAIL', sent: 0, opened: 0, bounced: m.email.bounced })
  }
  return build({ leads: sum((m) => m.leads), contacted: sum((m) => m.contacted), replied: sum((m) => m.replied), positive: sum((m) => m.positive), converted: sum((m) => m.converted) }, channels)
}

/**
 * Leads ready to go (FAST_TRACK or NORMAL) that have not received the first
 * step yet, per campaign. A campaign with no step counts none.
 */
export async function getAwaitingFirstStep(db: Db, campaignIds: string[]): Promise<Map<string, number>> {
  if (campaignIds.length === 0) return new Map()
  const rows = await db.$queryRaw<Array<{ cid: string; n: number }>>`
    WITH first_step AS (
      SELECT DISTINCT ON ("campaignId") "campaignId", "id"
      FROM "CampaignEmailStep"
      WHERE "campaignId" = ANY(${campaignIds}::text[])
      ORDER BY "campaignId", "position" ASC
    )
    SELECT l."campaignId" AS cid, count(*)::int AS n
    FROM "Lead" l
    JOIN first_step f ON f."campaignId" = l."campaignId"
    WHERE l."scoreBadge"::text IN ('FAST_TRACK', 'NORMAL')
      AND NOT EXISTS (SELECT 1 FROM "EmailSend" s WHERE s."leadId" = l."id" AND s."emailStepId" = f."id" AND s."status"::text IN (${SENT}))
    GROUP BY l."campaignId"`
  return new Map(rows.map((r) => [r.cid, r.n]))
}

/** The figures a campaign card shows (list and home), from the metrics. */
export function cardFigures(m: CampaignMetrics) {
  return {
    contactedCount: m.contacted,
    repliedCount: m.replied,
    sentCount: m.messages.total,
    messagesByChannel: m.messages.byChannel,
    emailSentCount: m.email.sent,
    emailOpenedCount: m.email.opened,
    // Opens on emails only; replies per lead contacted.
    openRate: m.email.sent > 0 ? m.email.openRate.rate * 100 : 0,
    replyRate: m.replyRate.rate * 100,
    conversionRate: m.conversionRate.rate * 100,
  }
}
