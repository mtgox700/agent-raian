import { redirect, notFound }   from 'next/navigation'
import { ApiError }             from '@phantera/sdk'
import { DashboardShell }       from '@/components/dashboard/DashboardShell'
import { CampaignDetailClient } from '@/components/dashboard/CampaignDetailClient'
import { loadView }             from '@/lib/front/server-api'

interface PageProps {
  params: Promise<{ campaignId: string }>
}

/** /dashboard/campaigns/[campaignId] (data: GET /api/views/campaign/[campaignId]). */
export default async function CampaignDetailPage({ params }: PageProps) {
  // Next.js 15+: params is a Promise: must be awaited before accessing props.
  const { campaignId } = await params

  const view = await loadView('views.campaign', { params: { campaignId } }).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound()
    throw err
  })
  if ('redirectTo' in view) redirect(view.redirectTo)

  return (
    <DashboardShell>
      <CampaignDetailClient
        campaign={view.campaign}
        stepStats={view.stepStats}
        leadCounts={view.leadCounts}
        leads={view.leads}
        workspaceId={view.workspaceId}
        plan={view.plan}
        pendingCount={view.pendingCount}
        unverifiedCount={view.unverifiedCount}
      />
    </DashboardShell>
  )
}
