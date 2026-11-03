import type { Metadata } from 'next'
import { AppPage } from '@/components/app/AppPage'
import { CampaignWizard } from '@/components/dashboard/campaign-wizard/CampaignWizard'
import { wizardCopy as t } from '@/lib/copy/campaign-wizard'

export const metadata: Metadata = { title: t.title }

/**
 * /dashboard/campaigns/new: the campaign wizard. No view to load: the
 * dashboard layout already gates the session and the workspace; the wizard
 * creates through campaigns.create.
 */
export default function NewCampaignPage() {
  return (
    <AppPage title={t.title} description={t.subtitle}>
      <CampaignWizard />
    </AppPage>
  )
}
