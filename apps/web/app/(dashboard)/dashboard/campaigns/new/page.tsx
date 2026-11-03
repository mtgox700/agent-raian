import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { CampaignWizard } from '@/components/dashboard/campaigns/CampaignWizard'

// Full-screen wizard: no DashboardShell wrapper
export default async function NewCampaignPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return <CampaignWizard />
}
