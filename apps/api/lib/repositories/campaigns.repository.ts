/**
 * Phantera: Campaigns Repository
 *
 * Aggregated workspace-level campaign stats for dashboard widgets.
 */

import { db } from '@/lib/db'
import { campaignScope, leadScope, type Scope } from '@/lib/auth/scope'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceOverview {
  totalLeads: number
  totalSent: number
  totalOpened: number
  totalReplied: number
  totalQualified: number
  overallOpenRate: number    // %
  overallReplyRate: number   // %
  activeCampaigns: number
}

export interface FunnelStep {
  label: string
  count: number
  color: string
  percentage: number
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export async function getWorkspaceOverview(scope: Scope): Promise<WorkspaceOverview> {
  const [campaigns, leadCounts] = await Promise.all([
    db.campaign.findMany({
      where: campaignScope(scope),
      select: {
        status: true,
        sentCount: true,
        openCount: true,
        replyCount: true,
      },
    }),
    db.lead.groupBy({
      by: ['status'],
      where: leadScope(scope),
      _count: { id: true },
    }),
  ])

  const totalSent    = campaigns.reduce((a, c) => a + c.sentCount, 0)
  const totalOpened  = campaigns.reduce((a, c) => a + c.openCount, 0)
  const totalReplied = campaigns.reduce((a, c) => a + c.replyCount, 0)
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length

  const statusMap: Record<string, number> = {}
  for (const g of leadCounts) statusMap[g.status] = g._count.id

  const totalLeads     = Object.values(statusMap).reduce((a, b) => a + b, 0)
  const totalQualified = (statusMap['qualified'] ?? 0) + (statusMap['converted'] ?? 0)

  return {
    totalLeads,
    totalSent,
    totalOpened,
    totalReplied,
    totalQualified,
    overallOpenRate:  totalSent > 0 ? Math.round((totalOpened  / totalSent) * 100) : 0,
    overallReplyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
    activeCampaigns,
  }
}

// ─── Funnel ───────────────────────────────────────────────────────────────────

/**
 * Lead funnel, all time, in distinct leads: each stage is a share of the
 * leads reached, and each is contained in the one before it.
 *
 * Opens are left out on purpose: privacy proxies open emails on their own,
 * LinkedIn has none, so "ont ouvert" came out below "ont répondu" and the
 * funnel lied. One aggregate query, whatever the volume (it used to load
 * every send row: 50 000 rows, 3.9 s).
 */
export async function getWorkspaceFunnel(scope: Scope): Promise<FunnelStep[]> {
  const ids = (await db.campaign.findMany({ where: campaignScope(scope), select: { id: true } })).map((c) => c.id)
  const [row] = ids.length === 0 ? [{ reached: 0, delivered: 0, replied: 0, positive: 0, qualified: 0 }] : await db.$queryRaw<Array<{ reached: number; delivered: number; replied: number; positive: number; qualified: number }>>`
    WITH reached AS (
      SELECT s."leadId", bool_or(s."status"::text <> 'BOUNCED') AS delivered
      FROM "EmailSend" s
      WHERE s."campaignId" = ANY(${ids}::text[]) AND s."sentAt" IS NOT NULL
        AND s."status"::text NOT IN ('PENDING', 'SENDING', 'FAILED')
      GROUP BY s."leadId"
    )
    SELECT count(*)::int AS reached,
           count(*) FILTER (WHERE r.delivered)::int AS delivered,
           count(*) FILTER (WHERE r.delivered AND EXISTS (SELECT 1 FROM "EmailReply" e WHERE e."leadId" = r."leadId" AND e."campaignId" = ANY(${ids}::text[])))::int AS replied,
           count(*) FILTER (WHERE r.delivered AND EXISTS (SELECT 1 FROM "EmailReply" e WHERE e."leadId" = r."leadId" AND e."campaignId" = ANY(${ids}::text[]) AND e."classification" = 'POSITIVE'))::int AS positive,
           count(*) FILTER (WHERE r.delivered AND l."status" IN ('qualified', 'converted'))::int AS qualified
    FROM reached r JOIN "Lead" l ON l."id" = r."leadId"`

  const top = row.reached
  // One decimal: 89 replies out of 2 737 is 3,3 %, not 3 %.
  const share = (n: number) => (top > 0 ? Math.round((n / top) * 1000) / 10 : 0)
  return [
    { label: 'Contactés',          count: top,           color: 'var(--brand-primary)', percentage: top > 0 ? 100 : 0 },
    { label: 'Sans rebond',        count: row.delivered, color: 'var(--brand-primary)', percentage: share(row.delivered) },
    { label: 'Ont répondu',        count: row.replied,   color: 'var(--gold)', percentage: share(row.replied) },
    { label: 'Réponse positive',   count: row.positive,  color: 'var(--gold)', percentage: share(row.positive) },
    { label: 'Qualifiés',          count: row.qualified, color: 'var(--gold)', percentage: share(row.qualified) },
  ]
}
