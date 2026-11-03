import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { LeadsPageClient } from '@/components/dashboard/LeadsPageClient'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { campaignScope, leadScope } from '@/lib/auth/scope'
import type { LeadWithEnrichment } from '@/lib/types/lead'
import type { CampaignOption } from '@/components/dashboard/AddLeadModal'
import { LEAD_LIST_LIMIT, LEAD_LIST_ORDER, toLeadRow } from '@/lib/leads/lead-rows'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

// Offers with an annual price in Stripe: read on the server, where the price IDs live.
const ANNUAL_PLANS = (['PRO', 'BUSINESS', 'ENTERPRISE'] as const).filter((k) => Boolean(PLAN_CONFIG[k].stripeAnnualPriceId))

export default async function LeadsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const workspaceAccess = await requireAccess(userId, 'lead.read')
  const workspace = workspaceAccess.ok ? workspaceAccess.ctx : null

  let leads: LeadWithEnrichment[] = []
  let campaigns: CampaignOption[] = []
  let workspaceId = ''
  let totalLeadCount = 0

  if (workspace) {
    workspaceId = workspace.workspaceId

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
    totalLeadCount = dbTotal

    leads = dbLeads.map(toLeadRow)

    campaigns = dbCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status.toLowerCase(),
    }))
  }

  return (
    <DashboardShell>
      <LeadsPageClient
        initialLeads={leads}
        workspaceId={workspaceId}
        campaigns={campaigns}
        plan={workspace?.plan ?? 'FREE'}
        totalLeadCount={totalLeadCount}
        annualPlans={ANNUAL_PLANS}
      />
    </DashboardShell>
  )
}
