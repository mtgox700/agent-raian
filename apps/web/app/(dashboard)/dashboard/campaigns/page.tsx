import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CampaignsPageClient } from '@/components/dashboard/CampaignsPageClient'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { cardFigures, getAwaitingFirstStep, getCampaignMetrics, emptyMetrics } from '@/lib/campaigns/metrics'
import { checkEmailSendQuota } from '@/lib/stripe/quota'
import type { Campaign } from '@/lib/types/dashboard'

export default async function CampaignsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const workspaceAccess = await requireAccess(userId, 'campaign.read')
  const workspace = workspaceAccess.ok ? workspaceAccess.ctx : null

  let campaigns: Campaign[] = []
  let workspaceId = ''
  // null only when the plan has no monthly e-mail limit.
  let emailsRemaining: number | null = null

  if (workspace) {
    workspaceId = workspace.workspaceId

    const dbCampaigns = await db.campaign.findMany({
      where: campaignScope(workspace),
      include: {
        _count: { select: { leads: true } },
        emailSteps: { select: { id: true, channel: true }, orderBy: { position: 'asc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    })

    const campaignIds = dbCampaigns.map((c) => c.id)

    // Every figure from the rows, in a few grouped queries whatever the
    // volume (lib/campaigns/metrics): never the counters stored on Campaign,
    // never thousands of ids sent back to the database.
    const [metrics, awaiting, emailQuota] = await Promise.all([
      getCampaignMetrics(db, campaignIds),
      getAwaitingFirstStep(db, campaignIds),
      checkEmailSendQuota(workspaceId),
    ])
    emailsRemaining = emailQuota.limit === Infinity
      ? null
      : Math.max(0, emailQuota.limit - emailQuota.current)

    campaigns = dbCampaigns.map((c) => {
      const m = metrics.get(c.id) ?? emptyMetrics()
      return {
        id: c.id,
        name: c.name,
        status: c.status.toLowerCase() as Campaign['status'],
        targetCount: c._count.leads,
        ...cardFigures(m),
        startDate: c.createdAt.toISOString(),
        industry: c.targetIndustry ?? '',
        aiPersonalization: true,
        qualifiedLeadsCount: awaiting.get(c.id) ?? 0,
        firstStepChannel: c.emailSteps[0]?.channel ?? 'EMAIL',
      }
    })
  }

  return (
    <DashboardShell>
      <CampaignsPageClient campaigns={campaigns} workspaceId={workspaceId} emailsRemaining={emailsRemaining} />
    </DashboardShell>
  )
}
