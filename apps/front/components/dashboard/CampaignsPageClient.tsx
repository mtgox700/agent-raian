'use client'

import type { StepChannelDb } from '@/lib/types/channels'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { useState } from 'react'
import { Plus, Filter, Send, Pause, Play } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CampaignCard } from '@/components/dashboard/CampaignCard'
import { CampaignLaunchDialog } from '@/components/dashboard/CampaignLaunchDialog'
import type { Campaign, CampaignStatus, MetricData } from '@/lib/types/dashboard'

interface CampaignsPageClientProps {
  campaigns: Campaign[]
  workspaceId: string
  /** E-mails left this month on the plan, computed on the server; null = no limit. */
  emailsRemaining: number | null
}

const FILTERS: { key: CampaignStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'Toutes'     },
  { key: 'active',    label: 'Actives'    },
  { key: 'paused',    label: 'En pause'   },
  { key: 'draft',     label: 'Brouillons' },
  { key: 'completed', label: 'Terminées'  },
]

// Every figure says its base and its period: "50 %" alone on six emails reads
// as a result it is not. Same tones as the home page (MetricCard).
function campaignKpis(f: { emailOpened: number; emailSent: number; replied: number; contacted: number; totalSent: number; active: number }): MetricData[] {
  const flat = { previousValue: null, trend: 'flat' as const }
  return [
    {
      id: 'open', label: 'Ouvertures', unit: '%', color: 'rgb(var(--c-muted))', ...flat,
      value: f.emailSent > 0 ? (f.emailOpened / f.emailSent) * 100 : null,
      caption: f.emailSent > 0 ? `${f.emailOpened} sur ${f.emailSent} e-mails, depuis le début, mesure indicative` : 'aucun e-mail envoyé',
    },
    {
      id: 'reply', label: 'Taux de réponse', unit: '%', color: 'var(--gold)', ...flat,
      value: f.contacted > 0 ? (f.replied / f.contacted) * 100 : null,
      caption: f.contacted > 0 ? `${f.replied} sur ${f.contacted} leads contactés` : 'aucun lead contacté',
    },
    { id: 'sent', label: 'Messages envoyés', value: f.totalSent, color: 'var(--brand-primary)', caption: 'tous canaux, depuis le début', ...flat },
    { id: 'active', label: 'Campagnes actives', value: f.active, color: 'rgb(var(--c-muted))', caption: 'en ce moment', ...flat },
  ]
}

export function CampaignsPageClient({ campaigns: initialCampaigns, workspaceId, emailsRemaining }: CampaignsPageClientProps) {
  const [campaigns, setCampaigns]       = useState(initialCampaigns)
  const [filter, setFilter]             = useState<CampaignStatus | 'all'>('all')
  // Progressive disclosure: render 9 cards, reveal more on demand (keeps the
  // grid scannable and the initial render light on large workspaces).
  const CAMPAIGNS_BATCH = 9
  const [visibleCount, setVisibleCount] = useState(CAMPAIGNS_BATCH)
  const [pendingIds, setPendingIds]     = useState<Set<string>>(new Set())
  const [launchDialog, setLaunchDialog] = useState<{
    open:           boolean
    campaignId:     string
    campaignName:   string
    qualifiedLeads: number
    firstStepChannel: StepChannelDb
  } | null>(null)

  const filtered =
    filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter)
  const visible   = filtered.slice(0, visibleCount)
  const remaining = filtered.length - visible.length

  // Computed stats
  const activeCampaigns = campaigns.filter((c) => c.status === 'active')
  // Pooled over every campaign, never a mean of rates: leads who replied over
  // leads contacted, opened over sent emails (lib/campaigns/metrics).
  const totalSent    = campaigns.reduce((a, c) => a + c.sentCount, 0)
  const contacted    = campaigns.reduce((a, c) => a + c.contactedCount, 0)
  const replied      = campaigns.reduce((a, c) => a + (c.repliedCount ?? 0), 0)
  const emailSent    = campaigns.reduce((a, c) => a + (c.emailSentCount ?? 0), 0)
  const emailOpened  = campaigns.reduce((a, c) => a + (c.emailOpenedCount ?? 0), 0)
  const kpis = campaignKpis({ emailOpened, emailSent, replied, contacted, totalSent, active: activeCampaigns.length })

  // ── Pause / Resume handler ────────────────────────────────────────────────

  const handleStatusChange = (campaignId: string, action: 'pause' | 'resume') => {
    if (pendingIds.has(campaignId)) return // debounce double-clicks

    const newStatus: CampaignStatus     = action === 'pause' ? 'paused' : 'active'
    const revertStatus: CampaignStatus  = action === 'pause' ? 'active' : 'paused'

    // Optimistic update
    setCampaigns((prev) => prev.map((c) => c.id === campaignId ? { ...c, status: newStatus } : c))
    setPendingIds((prev) => new Set(prev).add(campaignId))

    void fetch(`/api/campaigns/${campaignId}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, workspaceId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setCampaigns((prev) => prev.map((c) => c.id === campaignId ? { ...c, status: revertStatus } : c))
          const data = await res.json() as { error?: string }
          toast.error(data.error ?? 'Erreur lors du changement de statut')
        } else {
          toast.success(
            action === 'pause'
              ? 'Campagne mise en pause : les séquences s\'arrêtent'
              : 'Campagne relancée : les séquences reprennent',
          )
        }
      })
      .catch(() => {
        setCampaigns((prev) => prev.map((c) => c.id === campaignId ? { ...c, status: revertStatus } : c))
        toast.error('Erreur réseau : réessayez')
      })
      .finally(() => {
        setPendingIds((prev) => { const next = new Set(prev); next.delete(campaignId); return next })
      })
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      {/* Static (no entrance animation): the staggered load-time reveals were the
          CLS source and added nothing above the fold. Final look unchanged. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-white">Campagnes</h1>
            <span className="font-mono text-xs tabular-nums text-muted">{campaigns.length}</span>
            {activeCampaigns.length > 0 && (
              <StatusBadge tone="signal" live>
                {activeCampaigns.length} active{activeCampaigns.length > 1 ? 's' : ''}
              </StatusBadge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Gérez vos séquences de prospection
          </p>
        </div>

        <a href="/dashboard/campaigns/new" className={cn(buttonVariants({ size: 'sm' }), 'gap-2')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouvelle campagne
        </a>
      </div>

      {/* ── KPI stat cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((metric, i) => <MetricCard key={metric.id} metric={metric} index={i} />)}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer les campagnes par statut">
        <Filter className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => { setFilter(key); setVisibleCount(CAMPAIGNS_BATCH) }}
            className={cn(
              'rounded-md border px-3 py-1 font-mono text-xs transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan',
              filter === key
                ? 'border-cyan/40 bg-cyan/[0.08] text-cyan'
                : 'border-border text-muted hover:border-white/20 hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Campaign grid (no fade on filter change: the list just updates) ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-4 rounded-[10px] border border-dashed border-border px-6 py-16 text-center">
              <div>
                <p className="text-sm font-semibold text-white">
                  {filter === 'all'
                    ? 'Aucune campagne pour l\'instant'
                    : 'Aucune campagne dans cette catégorie'}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {filter === 'all'
                    ? 'Créez une séquence : la cible, les étapes, puis le lancement.'
                    : 'Changez de filtre ou créez une nouvelle campagne.'}
                </p>
              </div>
              {filter === 'all' && (
                <a href="/dashboard/campaigns/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Créer une campagne
                </a>
              )}
            </div>
          )}

          {/* Real campaigns: actions live in the card footer (no hover overlay) */}
          {visible.map((campaign, i) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              index={i}
              actions={
                <>
                  {campaign.status === 'active' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatusChange(campaign.id, 'pause')}
                      disabled={pendingIds.has(campaign.id)}
                      className="gap-1.5"
                    >
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      Pause
                    </Button>
                  )}
                  {campaign.status === 'paused' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatusChange(campaign.id, 'resume')}
                      disabled={pendingIds.has(campaign.id)}
                      className="gap-1.5"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Reprendre
                    </Button>
                  )}
                  {workspaceId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setLaunchDialog({
                          open:           true,
                          campaignId:     campaign.id,
                          campaignName:   campaign.name,
                          qualifiedLeads: campaign.qualifiedLeadsCount,
                          firstStepChannel: campaign.firstStepChannel ?? 'EMAIL',
                        })
                      }
                      className="gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      {campaign.status === 'draft' ? 'Lancer' : 'Relancer'}
                    </Button>
                  )}
                </>
              }
            />
          ))}

          {/* New campaign slot: a quiet dashed hairline, not a call to arms */}
          <a
            href="/dashboard/campaigns/new"
            className="group flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border p-6 text-center transition-colors duration-200 ease-signal hover:border-cyan/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <Plus className="h-5 w-5 text-muted transition-colors duration-200 group-hover:text-cyan" aria-hidden="true" />
            <p className="text-sm font-semibold text-muted transition-colors duration-200 group-hover:text-white">
              Créer une campagne
            </p>
            <p className="font-mono text-xs text-muted">
              Cible, étapes, lancement
            </p>
          </a>
      </div>

      {/* ── Show more (progressive disclosure) ───────────────────────────── */}
      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setVisibleCount((n) => n + CAMPAIGNS_BATCH)}
            className="gap-2"
          >
            Afficher plus
            <span className="font-mono text-xs tabular-nums text-cyan">
              {remaining} restante{remaining > 1 ? 's' : ''}
            </span>
          </Button>
        </div>
      )}

      {/* ── Launch dialog ─────────────────────────────────────────────────── */}
      {launchDialog && workspaceId && (
        <CampaignLaunchDialog
          open={launchDialog.open}
          campaignId={launchDialog.campaignId}
          campaignName={launchDialog.campaignName}
          workspaceId={workspaceId}
          qualifiedLeads={launchDialog.qualifiedLeads}
          emailsRemaining={emailsRemaining}
          firstStepChannel={launchDialog.firstStepChannel}
          // Close, do not unmount: the native <dialog> then gives focus back to the button that opened it.
          onClose={() => setLaunchDialog((d) => (d ? { ...d, open: false } : d))}
          onSuccess={() => {
            const launchedId = launchDialog.campaignId
            setCampaigns((prev) => prev.map((c) => (c.id === launchedId ? { ...c, status: 'active' as const } : c)))
          }}
        />
      )}
    </div>
  )
}
