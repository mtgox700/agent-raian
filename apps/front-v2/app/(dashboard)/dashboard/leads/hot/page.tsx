import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { FunnelWidget } from '@/components/dashboard/hot-leads/FunnelWidget'
import { HotLeadsExportButton } from '@/components/dashboard/hot-leads/HotLeadsExportButton'
import { HotLeadsList } from '@/components/dashboard/hot-leads/HotLeadsList'
import { NAV_ITEMS } from '@/lib/app-copy'
import { hotLeadsCopy } from '@/lib/copy/hot-leads'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: NAV_ITEMS.find((i) => i.href === '/dashboard/leads/hot')?.label }

/** /dashboard/leads/hot: leads to answer now (data: GET /api/views/hot-leads). */
export default async function HotLeadsPage({ searchParams }: { searchParams: Promise<{ lid?: string }> }) {
  const [view, params] = await Promise.all([loadView('views.hotLeads', {}), searchParams])
  if ('redirectTo' in view) redirect(view.redirectTo)
  const { leads, hotCount, funnel, plan } = view

  return (
    <AppPage
      title={hotLeadsCopy.title}
      description={hotLeadsCopy.description(hotCount)}
      // CRM-ready export: the bridge to the customer's CRM.
      actions={<HotLeadsExportButton leads={leads} plan={plan} />}
      className="space-y-6 pb-8"
    >
      <FunnelWidget steps={funnel} />
      {/* ?lid= from a notification: scroll to and mark that lead. */}
      <HotLeadsList initialLeads={leads} focusId={params.lid ?? undefined} />
    </AppPage>
  )
}
