import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { AppPage } from '@/components/app/AppPage'
import { Badge, buttonVariants } from '@/components/ui'
import { CampaignDetail } from '@/components/dashboard/campaign/CampaignDetail'
import { campaignCard } from '@/lib/app-copy'
import { campaignCopy as t } from '@/lib/copy/campaign'
import { campaignsCopy } from '@/lib/copy/campaigns'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: campaignsCopy.title }

/** /dashboard/campaigns/[campaignId] (data: GET /api/views/campaign/[campaignId]); 404 outside the member's scope. */
export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const view = await loadView('views.campaign', { params: { campaignId } }).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound()
    throw err
  })
  if ('redirectTo' in view) redirect(view.redirectTo)

  const status = view.campaign.status.toLowerCase()
  const badge = campaignCard.status[status] ?? { tone: 'neutral' as const, label: t.draftStatus }

  return (
    <AppPage
      title={view.campaign.name}
      actions={
        <>
          {/* The Analyst, opened on this campaign: the question is prefilled, never sent. */}
          <Link href={t.whyHref(view.campaign.name)} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'max-sm:hidden' })}>
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {t.why}
          </Link>
          <Badge tone={badge.tone} live={status === 'active'}>{badge.label}</Badge>
        </>
      }
    >
      <CampaignDetail
        campaign={view.campaign}
        stepStats={view.stepStats}
        leadCounts={view.leadCounts}
        leads={view.leads}
        workspaceId={view.workspaceId}
        plan={view.plan}
        pendingCount={view.pendingCount}
        unverifiedCount={view.unverifiedCount}
      />
    </AppPage>
  )
}
