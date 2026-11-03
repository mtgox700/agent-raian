/**
 * Scores (again) leads of a workspace, each against the targeting of its own
 * campaign and the workspace ICP. Used by the "Scorer" button, after an
 * email is enriched (its reliability is a fifth of the score), after the ICP
 * changes, and every day for the leads left unscored.
 *
 * A priority the user set by hand is kept unless the user asks again
 * (`force`): a background job never overrides a person's choice.
 */

import type { LeadScoreBadge, PrismaClient } from '@prisma/client'
import { scoreLeads, scoreUpdate, type CampaignTargeting } from '@/lib/agents/lead-scorer'

export const MANUAL_REASON = 'Priorité choisie à la main (pas de score IA)'

/** Leads scored per call at most (10 model calls). */
export const RESCORE_MAX = 100

export type Distribution = Record<LeadScoreBadge, number>

/**
 * Not a priority set by hand. Spelled with OR: in SQL, NOT (reason = x) is
 * unknown for a NULL reason, so it also dropped every lead never scored.
 */
const notManual = { OR: [{ scoreReason: null }, { scoreReason: { not: MANUAL_REASON } }] }

const EMPTY_TARGETING: CampaignTargeting = { targetTitles: [], targetCompanySizes: [], targetGeos: [], goal: 'LEADS' }

export async function rescoreLeads(
  db: PrismaClient,
  workspaceId: string,
  leadIds: string[],
  opts: { force?: boolean } = {},
): Promise<{ scored: number; distribution: Distribution }> {
  const distribution: Distribution = { FAST_TRACK: 0, NORMAL: 0, NURTURE: 0, SKIP: 0, UNSCORED: 0 }
  const ids = [...new Set(leadIds)].slice(0, RESCORE_MAX)
  if (ids.length === 0) return { scored: 0, distribution }

  const [workspace, leads] = await Promise.all([
    db.workspace.findUnique({ where: { id: workspaceId }, select: { targetIndustry: true, targetCompanySize: true } }),
    db.lead.findMany({
      where: {
        id: { in: ids }, workspaceId,
        ...(opts.force ? {} : notManual),
      },
      select: {
        id: true, firstName: true, lastName: true, title: true, company: true, industry: true, country: true, companySize: true,
        enrichment: { select: { emailConfidence: true } },
        campaign: { select: { id: true, targetTitles: true, targetCompanySizes: true, targetGeos: true, goal: true } },
      },
    }),
  ])
  if (!workspace || leads.length === 0) return { scored: 0, distribution }
  const icp = { targetIndustry: workspace.targetIndustry, targetCompanySize: workspace.targetCompanySize }

  // One scoring call per campaign: each lead against the targeting it is prospected for.
  const groups = new Map<string, typeof leads>()
  for (const l of leads) {
    const key = l.campaign?.id ?? ''
    groups.set(key, [...(groups.get(key) ?? []), l])
  }

  let scored = 0
  for (const group of groups.values()) {
    const c = group[0].campaign
    const targeting: CampaignTargeting = c
      ? { targetTitles: c.targetTitles, targetCompanySizes: c.targetCompanySizes, targetGeos: c.targetGeos, goal: c.goal }
      : EMPTY_TARGETING
    const results = await scoreLeads(group.map((l) => ({
      id: l.id, firstName: l.firstName, lastName: l.lastName, title: l.title, company: l.company,
      industry: l.industry, country: l.country, companySize: l.companySize,
      emailConfidence: l.enrichment?.emailConfidence ?? null,
    })), icp, targeting)
    for (const r of results) {
      // Counted once written: a lead deleted meanwhile is not "scored".
      const { count } = await db.lead.updateMany({ where: { id: r.leadId, workspaceId }, data: scoreUpdate(r) })
      if (count > 0) { distribution[r.badge]++; scored++ }
    }
  }
  return { scored, distribution }
}

/**
 * Leads worth scoring again when the ICP changes: not contacted yet (a
 * contacted lead's score no longer decides anything), most recent first.
 */
export async function leadsAwaitingContact(db: PrismaClient, workspaceId: string, limit = RESCORE_MAX): Promise<string[]> {
  const rows = await db.lead.findMany({
    where: { workspaceId, status: 'new', doNotContact: false, emailSends: { none: {} }, ...notManual },
    orderBy: { createdAt: 'desc' }, take: limit, select: { id: true },
  })
  return rows.map((r) => r.id)
}

/** Leads left unscored (a failed scoring), oldest first, to retry. */
export async function unscoredLeads(db: PrismaClient, workspaceId: string, limit = RESCORE_MAX): Promise<string[]> {
  const rows = await db.lead.findMany({
    where: { workspaceId, scoreBadge: 'UNSCORED', doNotContact: false, status: 'new' },
    orderBy: { createdAt: 'asc' }, take: limit, select: { id: true },
  })
  return rows.map((r) => r.id)
}
