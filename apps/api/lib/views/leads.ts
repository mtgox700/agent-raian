/**
 * Data of the Leads page (/dashboard/leads), served by GET /api/views/leads.
 *
 * Leads (capped at LEAD_LIST_LIMIT for page weight), campaigns for the
 * "add to campaign" picker and the real total, in one parallel round-trip.
 */

import type { Plan, PrismaClient } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access'
import { campaignScope, leadScope } from '@/lib/auth/scope'
import type { LeadWithEnrichment } from '@/lib/types/lead'
import { LEAD_LIST_LIMIT, LEAD_LIST_ORDER, toLeadRow } from '@/lib/leads/lead-rows'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

export type AnnualPlan = 'PRO' | 'BUSINESS' | 'ENTERPRISE'

export interface LeadsView {
  leads: LeadWithEnrichment[]
  campaigns: { id: string; name: string; status: string }[]
  workspaceId: string
  plan: Plan
  totalLeadCount: number
  annualPlans: AnnualPlan[]
}

// Offers with an annual price in Stripe: read on the server, where the price IDs live.
const ANNUAL_PLANS: AnnualPlan[] = (['PRO', 'BUSINESS', 'ENTERPRISE'] as const).filter((k) => Boolean(PLAN_CONFIG[k].stripeAnnualPriceId))

/** Without workspace access the page shows an empty base on the FREE plan, as before. */
export function emptyLeadsView(): LeadsView {
  return { leads: [], campaigns: [], workspaceId: '', plan: 'FREE', totalLeadCount: 0, annualPlans: ANNUAL_PLANS }
}

export async function leadsView(db: PrismaClient, workspace: AccessContext): Promise<LeadsView> {
  const [dbLeads, dbCampaigns, dbTotal] = await Promise.all([
    db.lead.findMany({
      where: leadScope(workspace),
      include: { enrichment: true },
      orderBy: LEAD_LIST_ORDER,
      take: LEAD_LIST_LIMIT,
    }),
    db.campaign.findMany({
      where: campaignScope(workspace),
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: 'desc' },
    }),
    // Real total: the list above is capped at 500 for page weight, but the
    // header must show the true base size (founder-reported confusion vs
    // the Command Center's count, 2026-07-13).
    db.lead.count({ where: leadScope(workspace) }),
  ])

  return {
    leads: dbLeads.map(toLeadRow),
    campaigns: dbCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status.toLowerCase(),
    })),
    workspaceId: workspace.workspaceId,
    plan: workspace.plan,
    totalLeadCount: dbTotal,
    annualPlans: ANNUAL_PLANS,
  }
}
