import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { AppPage } from '@/components/app/AppPage'
import { Badge, buttonVariants } from '@/components/ui'
import { CampaignsScreen } from '@/components/dashboard/campaigns/CampaignsScreen'
import { campaignsCopy as t } from '@/lib/copy/campaigns'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: t.title }

/** /dashboard/campaigns: the workspace's campaigns (data: GET /api/views/campaigns). */
export default async function CampaignsPage() {
  const { campaigns, workspaceId, emailsRemaining } = await loadView('views.campaigns', {})
  const active = campaigns.filter((c) => c.status === 'active').length

  return (
    <AppPage
      title={<>{t.title} <span className="ml-1 align-middle font-mono text-xs font-normal tabular-nums text-quiet">{campaigns.length}</span></>}
      description={t.description}
      actions={
        <>
          {active > 0 && <Badge tone="accent" live className="max-sm:hidden">{t.activeCount(active)}</Badge>}
          <Link href={t.newHref} className={buttonVariants({ size: 'sm' })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t.newCampaign}
          </Link>
        </>
      }
    >
      <CampaignsScreen campaigns={campaigns} workspaceId={workspaceId} emailsRemaining={emailsRemaining} />
    </AppPage>
  )
}
