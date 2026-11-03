import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CampaignsPageClient } from '@/components/dashboard/CampaignsPageClient'
import { loadView } from '@/lib/front/server-api'

/** /dashboard/campaigns: the workspace's campaigns (data: GET /api/views/campaigns). */
export default async function CampaignsPage() {
  const { campaigns, workspaceId, emailsRemaining } = await loadView('views.campaigns', {})
  return (
    <DashboardShell>
      <CampaignsPageClient campaigns={campaigns} workspaceId={workspaceId} emailsRemaining={emailsRemaining} />
    </DashboardShell>
  )
}
