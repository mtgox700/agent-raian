'use client'

/**
 * /dashboard/campaigns: the KPI row, the status filter, the cards (shared
 * CampaignCard) with pause / resume (campaigns.updateStatus) and launch
 * (campaigns.launch, through CampaignLaunchDialog). Same data and calls as
 * body n°1's CampaignsPageClient.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Filter, Pause, Play, Plus, Send } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@phantera/sdk'
import { Button, buttonVariants } from '@/components/ui'
import { MetricCard } from '@/components/dashboard/home/MetricCard'
import { CampaignCard } from '@/components/dashboard/shared/CampaignCard'
import { CampaignLaunchDialog } from '@/components/dashboard/campaigns/CampaignLaunchDialog'
import { campaignsCopy as t } from '@/lib/copy/campaigns'
import { api } from '@/lib/front/api'
import type { DashboardMetric } from '@/lib/front/types'
import type { CampaignListItem, CampaignListStatus, StepChannelKey } from '@/lib/front/types-campaigns'
import { cn } from '@/lib/utils'

type FilterKey = CampaignListStatus | 'all'

/** Progressive disclosure: 9 cards, more on demand. */
const BATCH = 9

// Every figure says its base and its period. Pooled over every campaign,
// never a mean of rates (body n°1's campaignKpis).
function campaignKpis(f: { emailOpened: number; emailSent: number; replied: number; contacted: number; totalSent: number; active: number }): DashboardMetric[] {
  const flat = { previousValue: null, trend: 'flat' as const }
  return [
    {
      id: 'open', label: t.kpi.open, unit: '%', color: 'rgb(var(--c-muted))', ...flat,
      value: f.emailSent > 0 ? (f.emailOpened / f.emailSent) * 100 : null,
      caption: f.emailSent > 0 ? t.kpi.openCaption(f.emailOpened, f.emailSent) : t.kpi.openNone,
    },
    {
      id: 'reply', label: t.kpi.reply, unit: '%', color: 'rgb(var(--c-gold))', ...flat,
      value: f.contacted > 0 ? (f.replied / f.contacted) * 100 : null,
      caption: f.contacted > 0 ? t.kpi.replyCaption(f.replied, f.contacted) : t.kpi.replyNone,
    },
    { id: 'sent', label: t.kpi.sent, value: f.totalSent, color: 'rgb(var(--c-cyan))', caption: t.kpi.sentCaption, ...flat },
    { id: 'active', label: t.kpi.active, value: f.active, color: 'rgb(var(--c-muted))', caption: t.kpi.activeCaption, ...flat },
  ]
}

interface LaunchTarget { open: boolean; campaignId: string; campaignName: string; qualifiedLeads: number; firstStepChannel: StepChannelKey }

export function CampaignsScreen({ campaigns: initial, workspaceId, emailsRemaining }: {
  campaigns: CampaignListItem[]
  workspaceId: string
  /** E-mails left this month on the plan; null = no limit. */
  emailsRemaining: number | null
}) {
  const [campaigns, setCampaigns] = useState(initial)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [visibleCount, setVisibleCount] = useState(BATCH)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [launch, setLaunch] = useState<LaunchTarget | null>(null)

  const filtered = filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter)
  const visible = filtered.slice(0, visibleCount)
  const remaining = filtered.length - visible.length

  const active = campaigns.filter((c) => c.status === 'active').length
  const sum = (pick: (c: CampaignListItem) => number) => campaigns.reduce((a, c) => a + pick(c), 0)
  const kpis = campaignKpis({
    emailOpened: sum((c) => c.emailOpenedCount ?? 0),
    emailSent: sum((c) => c.emailSentCount ?? 0),
    replied: sum((c) => c.repliedCount ?? 0),
    contacted: sum((c) => c.contactedCount),
    totalSent: sum((c) => c.sentCount),
    active,
  })

  const setStatus = (id: string, status: CampaignListStatus) =>
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))

  const handleStatusChange = (campaignId: string, action: 'pause' | 'resume') => {
    if (pendingIds.has(campaignId)) return // a double click is one change
    const next: CampaignListStatus = action === 'pause' ? 'paused' : 'active'
    const revert: CampaignListStatus = action === 'pause' ? 'active' : 'paused'

    setStatus(campaignId, next) // optimistic
    setPendingIds((prev) => new Set(prev).add(campaignId))

    api.call('campaigns.updateStatus', { params: { campaignId }, body: { action, workspaceId } })
      .then(() => { toast.success(action === 'pause' ? t.paused : t.resumed) })
      .catch((err: unknown) => {
        setStatus(campaignId, revert)
        toast.error(err instanceof ApiError ? (err.body?.error ?? t.statusError) : t.networkError)
      })
      .finally(() => {
        setPendingIds((prev) => { const s = new Set(prev); s.delete(campaignId); return s })
      })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.filtersLabel}>
        <Filter className="h-3.5 w-3.5 text-quiet" aria-hidden="true" />
        {t.filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => { setFilter(key); setVisibleCount(BATCH) }}
            className={cn(
              'rounded-md border px-3 py-1 font-mono text-xs transition-colors duration-200 ease-signal',
              filter === key ? 'border-accent/40 bg-accent/[0.08] text-accent' : 'border-line text-quiet hover:border-quiet/50 hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-4 rounded-lg border border-dashed border-line px-6 py-16 text-center">
            <div>
              <p className="text-sm font-semibold text-ink">{filter === 'all' ? t.emptyAll : t.emptyFiltered}</p>
              <p className="mt-1 text-sm text-quiet">{filter === 'all' ? t.emptyAllBody : t.emptyFilteredBody}</p>
            </div>
            {filter === 'all' && (
              <Link href={t.newHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t.create}
              </Link>
            )}
          </div>
        )}

        {visible.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            actions={
              <>
                {campaign.status === 'active' && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleStatusChange(campaign.id, 'pause')} disabled={pendingIds.has(campaign.id)}>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.pause}
                  </Button>
                )}
                {campaign.status === 'paused' && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleStatusChange(campaign.id, 'resume')} disabled={pendingIds.has(campaign.id)}>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.resume}
                  </Button>
                )}
                {workspaceId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setLaunch({
                      open: true,
                      campaignId: campaign.id,
                      campaignName: campaign.name,
                      qualifiedLeads: campaign.qualifiedLeadsCount,
                      firstStepChannel: campaign.firstStepChannel ?? 'EMAIL',
                    })}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    {campaign.status === 'draft' ? t.launch : t.relaunch}
                  </Button>
                )}
              </>
            }
          />
        ))}

        <Link
          href={t.newHref}
          className="group flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-6 text-center transition-colors duration-200 ease-signal hover:border-accent/40"
        >
          <Plus className="h-5 w-5 text-quiet transition-colors duration-200 group-hover:text-accent" aria-hidden="true" />
          <span className="text-sm font-semibold text-quiet transition-colors duration-200 group-hover:text-ink">{t.create}</span>
          <span className="font-mono text-xs text-quiet">{t.createHint}</span>
        </Link>
      </div>

      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setVisibleCount((n) => n + BATCH)}>
            {t.showMore}
            <span className="font-mono text-xs tabular-nums text-accent">{t.remaining(remaining)}</span>
          </Button>
        </div>
      )}

      {launch && workspaceId && (
        <CampaignLaunchDialog
          key={launch.campaignId}
          open={launch.open}
          campaignId={launch.campaignId}
          campaignName={launch.campaignName}
          workspaceId={workspaceId}
          qualifiedLeads={launch.qualifiedLeads}
          emailsRemaining={emailsRemaining}
          firstStepChannel={launch.firstStepChannel}
          // Close, do not unmount: the native <dialog> gives focus back to its opener.
          onClose={() => setLaunch((d) => (d ? { ...d, open: false } : d))}
          onSuccess={() => setStatus(launch.campaignId, 'active')}
        />
      )}
    </div>
  )
}
