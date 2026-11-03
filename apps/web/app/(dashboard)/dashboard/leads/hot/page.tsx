import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Flame } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { HotLeadsTable } from '@/components/dashboard/HotLeadsTable'
import { HotLeadsExportButton } from '@/components/dashboard/HotLeadsExportButton'
import { FunnelWidget } from '@/components/dashboard/FunnelWidget'
import { requireAccess } from '@/lib/auth/access'
import { countHotLeads, getHotLeads } from '@/lib/repositories/leads.repository'
import { getWorkspaceFunnel } from '@/lib/repositories/campaigns.repository'

interface HotLeadsPageProps {
  searchParams: Promise<{ lid?: string }>
}

export default async function HotLeadsPage({ searchParams }: HotLeadsPageProps) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) redirect('/dashboard')
  const workspace = workspaceAccess.ctx

  const [{ leads }, hotCount, funnel, params] = await Promise.all([
    getHotLeads(workspace, 50),
    countHotLeads(workspace),
    getWorkspaceFunnel(workspace),
    searchParams,
  ])

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
          <HotLeadsExportButton leads={leads} plan={workspace.plan} />
        </div>

        {/* Funnel */}
        <FunnelWidget steps={funnel} />

        {/* Cards */}
        <HotLeadsTable initialLeads={leads} focusId={focusId} />
      </div>
    </DashboardShell>
  )
}
