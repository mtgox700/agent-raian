import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { LeadsPageClient } from '@/components/dashboard/LeadsPageClient'
import { loadView } from '@/lib/front/server-api'

/** /dashboard/leads: the lead base (data: GET /api/views/leads). */
export default async function LeadsPage() {
  const { leads, workspaceId, campaigns, plan, totalLeadCount, annualPlans } = await loadView('views.leads', {})

  return (
    <DashboardShell>
      <LeadsPageClient
        initialLeads={leads}
        workspaceId={workspaceId}
        campaigns={campaigns}
        plan={plan}
        totalLeadCount={totalLeadCount}
        annualPlans={annualPlans}
      />
    </DashboardShell>
  )
}
