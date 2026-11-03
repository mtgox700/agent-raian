import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { AnalyticsDashboard } from '@/components/dashboard/analytics/AnalyticsDashboard'
import { requireAccess } from '@/lib/auth/access'
import { db } from '@/lib/db'
import { getAnalyticsReport } from '@/lib/analytics/report'

/**
 * /dashboard/analytics: every figure from aggregated queries over the rows
 * the viewer may see (lib/analytics), filtered by the URL (?p=30d&c=…).
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) redirect('/onboarding')

  const report = await getAnalyticsReport(db, workspaceAccess.ctx, await searchParams)
  return (
    <DashboardShell>
      <AnalyticsDashboard report={report} />
    </DashboardShell>
  )
}
