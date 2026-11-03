import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { AnalyticsDashboard } from '@/components/dashboard/analytics/AnalyticsDashboard'
import { loadView } from '@/lib/front/server-api'

/**
 * /dashboard/analytics: every figure from aggregated queries over the rows
 * the viewer may see (data: GET /api/views/analytics), filtered by the URL
 * (?p=30d&c=…). Only single-valued filters count, as before.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const single = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

  const view = await loadView('views.analytics', {
    query: { p: single(params.p), c: single(params.c), vs: single(params.vs) },
  })
  if ('redirect' in view) redirect(view.redirect)

  return (
    <DashboardShell>
      <AnalyticsDashboard report={view.report} />
    </DashboardShell>
  )
}
