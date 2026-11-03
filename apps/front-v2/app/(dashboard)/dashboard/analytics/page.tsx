import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { AnalyticsDashboard } from '@/components/dashboard/analytics/AnalyticsDashboard'
import { analyticsCopy } from '@/lib/copy/analytics'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: analyticsCopy.title }

/**
 * /dashboard/analytics: every figure from aggregated queries over the rows
 * the viewer may see (data: GET /api/views/analytics), filtered by the URL
 * (?p=30d&c=…&vs=…). Only single-valued filters count.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const single = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

  const view = await loadView('views.analytics', {
    query: { p: single(params.p), c: single(params.c), vs: single(params.vs) },
  })
  if ('redirect' in view) redirect(view.redirect)

  return (
    <AppPage title={analyticsCopy.title} description={analyticsCopy.description}>
      <AnalyticsDashboard report={view.report} />
    </AppPage>
  )
}
