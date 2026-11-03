import { redirect } from 'next/navigation'
import { Flame } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { HotLeadsTable } from '@/components/dashboard/HotLeadsTable'
import { HotLeadsExportButton } from '@/components/dashboard/HotLeadsExportButton'
import { FunnelWidget } from '@/components/dashboard/FunnelWidget'
import { loadView } from '@/lib/front/server-api'

interface HotLeadsPageProps {
  searchParams: Promise<{ lid?: string }>
}

/** /dashboard/leads/hot: leads to answer now (data: GET /api/views/hot-leads). */
export default async function HotLeadsPage({ searchParams }: HotLeadsPageProps) {
  const [view, params] = await Promise.all([loadView('views.hotLeads', {}), searchParams])
  if ('redirectTo' in view) redirect(view.redirectTo)
  const { leads, hotCount, funnel, plan } = view

  // ?lid= from notification click: scroll & highlight that lead card
  const focusId = params.lid ?? undefined

  return (
    <DashboardShell>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-obsidian">
              <Flame className="h-4 w-4 text-gold" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-white">Leads chauds</h1>
              <p className="text-xs text-muted">
                <span className="font-mono tabular-nums text-gold">{hotCount}</span> lead{hotCount !== 1 ? 's' : ''} chaud{hotCount !== 1 ? 's' : ''} : répondez maintenant
              </p>
            </div>
          </div>
          {/* CRM-ready export: the poor-man's CRM bridge until HubSpot sync */}
          <HotLeadsExportButton leads={leads} plan={plan} />
        </div>

        {/* Funnel */}
        <FunnelWidget steps={funnel} />

        {/* Cards */}
        <HotLeadsTable initialLeads={leads} focusId={focusId} />
      </div>
    </DashboardShell>
  )
}
