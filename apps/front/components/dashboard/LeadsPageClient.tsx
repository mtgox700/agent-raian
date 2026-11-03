'use client'

import { downloadCsv, logExport, toCsv } from '@/lib/export/csv'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { isSendable } from '@/lib/leads/badges'
import { m } from 'framer-motion'
import { Users, Download, Zap, RefreshCw, UserPlus, Target, Lock } from 'lucide-react'
import { LeadsTable } from '@/components/dashboard/LeadsTable'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { Button } from '@/components/ui/button'
import { LeadSearchDrawer } from '@/components/dashboard/LeadSearchDrawer'
import { LeadSearchProgress, usePipelineStream } from '@/components/dashboard/LeadSearchProgress'
import { AddLeadModal } from '@/components/dashboard/AddLeadModal'
import { AssignCampaignModal } from '@/components/dashboard/AssignCampaignModal'
import { UpgradeModal } from '@/components/dashboard/UpgradeModal'
import { track } from '@/lib/analytics/events'
import type { ApolloSearchParams, LeadWithEnrichment, PipelineSummary } from '@/lib/types/lead'
import type { ProgressState } from '@/components/dashboard/LeadSearchProgress'
import type { CampaignOption } from '@/components/dashboard/AddLeadModal'
import type { Plan } from '@prisma/client'
import type { MetricData } from '@/lib/types/dashboard'

/** The scoring route's limit (lib/types/lead batchScoreSchema). */
const MAX_SCORE_BATCH = 100

interface LeadsPageClientProps {
  initialLeads: LeadWithEnrichment[]
  workspaceId: string
  campaigns: CampaignOption[]
  plan: Plan
  /** True DB count: the list itself is capped at 500 rows for page weight. */
  totalLeadCount?: number
  /** Offers that have an annual price in Stripe (computed on the server). */
  annualPlans?: readonly ('PRO' | 'BUSINESS' | 'ENTERPRISE')[]
}

const INITIAL_PROGRESS: ProgressState = {
  phase: 'idle',
  searchFound: 0,
  searchTotal: 0,
  enriched: 0,
  enrichTotal: 0,
  scored: 0,
  scoreTotal: 0,
  summary: null,
  error: null,
}

const LEAD_STATUS_CSV: Record<string, string> = {
  new:       'Nouveau',
  queued:    'En file',
  contacted: 'Contacté',
  qualified: 'Qualifié',
  converted: 'Converti',
  lost:      'Perdu',
}

export function LeadsPageClient({ initialLeads, workspaceId, campaigns, plan, totalLeadCount, annualPlans = [] }: LeadsPageClientProps) {
  const [leads, setLeads] = useState<LeadWithEnrichment[]>(initialLeads)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [isBulkEnriching, setIsBulkEnriching] = useState(false)
  const [isBulkScoring, setIsBulkScoring] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [upgradeReason, setUpgradeReason] = useState<'leads' | 'csv' | 'ai' | 'campaigns' | 'emails'>('leads')
  const abortRef = useRef<AbortController | null>(null)
  const router = useRouter()

  const { consume } = usePipelineStream()

  // The page holds the best 500 leads. Past that, a search or a status filter
  // is answered by the server over the whole base: it used to look only at
  // the 500 loaded (232 contacted leads, 26 found).
  const [serverResults, setServerResults] = useState<{ leads: LeadWithEnrichment[]; total: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)
  const isBaseCapped = (totalLeadCount ?? 0) > leads.length

  const handleQueryChange = useCallback((query: string, status: string) => {
    const seq = ++searchSeq.current
    if (!isBaseCapped || (query.trim() === '' && status === 'all')) {
      setServerResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    setTimeout(async () => {
      if (seq !== searchSeq.current) return
      try {
        const params = new URLSearchParams({ workspaceId, q: query.trim(), status })
        const res = await fetch(`/api/leads?${params.toString()}`)
        const data = await res.json() as { data?: LeadWithEnrichment[]; total?: number }
        if (!res.ok || !data.data) throw new Error(`HTTP ${res.status}`)
        if (seq === searchSeq.current) setServerResults({ leads: data.data, total: data.total ?? data.data.length })
      } catch {
        if (seq === searchSeq.current) setServerResults(null)
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 300)
  }, [isBaseCapped, workspaceId])

  const visibleLeads = serverResults?.leads ?? leads

  const handleLeadUpdated = useCallback((updated: LeadWithEnrichment) => {
    const replace = (list: LeadWithEnrichment[]) => list.map((l) => (l.id === updated.id ? updated : l))
    setLeads(replace)
    setServerResults((current) => (current ? { ...current, leads: replace(current.leads) } : current))
  }, [])

  const handleSearch = useCallback(async (params: ApolloSearchParams) => {
    setDrawerOpen(false)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    track('first_search_launched', { limit: params.limit, industry: params.industry })

    setProgress({
      phase: 'search',
      searchFound: 0,
      searchTotal: params.limit,
      enriched: 0,
      enrichTotal: 0,
      scored: 0,
      scoreTotal: 0,
      summary: null,
      error: null,
    })

    try {
      await consume(
        params,
        (event) => {
          setProgress((prev) => {
            switch (event.type) {
              case 'search_start':
                return { ...prev, phase: 'search', searchTotal: event.total }
              case 'search_progress':
                return { ...prev, searchFound: event.found }
              case 'search_done':
                return { ...prev, searchFound: event.saved }
              case 'enrich_start':
                return { ...prev, phase: 'enrich', enrichTotal: event.total }
              case 'enrich_progress':
                return { ...prev, enriched: event.enriched, enrichTotal: event.total }
              case 'enrich_done':
                return { ...prev, enriched: event.verified }
              case 'score_start':
                return { ...prev, phase: 'score', scoreTotal: event.total }
              case 'score_progress':
                return { ...prev, scored: event.scored, scoreTotal: event.total }
              case 'score_done':
                return { ...prev, scored: prev.scoreTotal }
              case 'pipeline_done': {
                const newLeads = event.leads as LeadWithEnrichment[]
                setLeads((current) => {
                  const existingIds = new Set(current.map((l) => l.id))
                  const toAdd = newLeads.filter((l) => !existingIds.has(l.id))
                  // ── Analytics: lead saved (fires once per pipeline run, not per lead) ──
                  if (toAdd.length > 0) {
                    track('first_lead_saved', { source: 'apollo' })
                  }
                  return [...toAdd, ...current]
                })
                return { ...prev, phase: 'done', summary: event.summary as PipelineSummary }
              }
              case 'error': {
                // Show upgrade modal on quota exceeded
                const msg = (event.message ?? '') as string
                if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('limit')) {
                  setUpgradeReason('leads')
                  setUpgradeModalOpen(true)
                }
                return { ...prev, phase: 'error', error: msg }
              }
              default:
                return prev
            }
          })
        },
        abortRef.current.signal
      )
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setProgress((prev) => ({ ...prev, phase: 'error', error: err.message }))
      }
    } finally {
      // Leads may have been saved even when the run ends in an error: reload
      // the server count shown in the header.
      router.refresh()
    }
  }, [consume, router])

  const handleBulkEnrich = async () => {
    if (selectedLeadIds.length === 0) return
    setIsBulkEnriching(true)
    try {
      const res = await fetch('/api/leads/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, leadIds: selectedLeadIds.slice(0, 25) }),
      })
      const data = await res.json() as { success?: boolean; data?: { results: Array<{ leadId: string; emailVerified: boolean; emailConfidence: number; emailStatus: string }> } }
      if (data.success && data.data?.results) {
        const enrichMap = new Map(data.data.results.map((r) => [r.leadId, r]))
        setLeads((prev) =>
          prev.map((lead) => {
            const enriched = enrichMap.get(lead.id)
            if (!enriched) return lead
            return {
              ...lead,
              enrichment: {
                emailVerified: enriched.emailVerified,
                emailConfidence: enriched.emailConfidence,
                emailStatus: enriched.emailStatus,
              },
            }
          })
        )
      }
    } catch {
      // non-fatal
    } finally {
      setIsBulkEnriching(false)
    }
  }

  const handleBulkScore = async () => {
    if (selectedLeadIds.length === 0) return
    if (selectedLeadIds.length > MAX_SCORE_BATCH) {
      toast.error(`Sélectionnez ${MAX_SCORE_BATCH} leads au plus à scorer (${selectedLeadIds.length} sélectionnés).`)
      return
    }
    setIsBulkScoring(true)
    try {
      const res = await fetch('/api/leads/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, leadIds: selectedLeadIds }),
      })
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string; data?: { scored: number; distribution: Record<string, number> } }
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Le scoring n’a pas abouti. Réessayez.')
        return
      }
      const d = data.data?.distribution ?? {}
      const parts = [['FAST_TRACK', 'Fast Track'], ['NORMAL', 'Normal'], ['NURTURE', 'Nurture'], ['SKIP', 'Écarté'], ['UNSCORED', 'non scoré']]
        .filter(([k]) => (d[k] ?? 0) > 0).map(([k, label]) => `${d[k]} ${label}`)
      toast.success(`${data.data?.scored ?? 0} lead${(data.data?.scored ?? 0) > 1 ? 's' : ''} scoré${(data.data?.scored ?? 0) > 1 ? 's' : ''}${parts.length ? ` : ${parts.join(', ')}` : ''}.`)
      if ((d.UNSCORED ?? 0) > 0) toast.warning(`${d.UNSCORED} lead${d.UNSCORED > 1 ? 's' : ''} n’ont pas pu être scorés : relancez le scoring.`)
      const refreshed = await fetch(`/api/leads?workspaceId=${workspaceId}`).then((r) => r.json()).catch(() => null) as { data?: LeadWithEnrichment[] } | null
      if (refreshed?.data) setLeads(refreshed.data)
    } catch {
      toast.error('Connexion perdue pendant le scoring. Réessayez.')
    } finally {
      setIsBulkScoring(false)
    }
  }

  const handleLeadAdded = useCallback((lead: LeadWithEnrichment) => {
    setLeads((prev) => {
      const exists = prev.some((l) => l.id === lead.id)
      return exists ? prev.map((l) => l.id === lead.id ? lead : l) : [lead, ...prev]
    })
    router.refresh()
  }, [router])

  // CSV export is a Pro+ feature: gate it before generating the blob
  const canExportCsv = plan !== 'FREE'

  // From the selection bar, only the selected leads are exported.
  const handleExportCSV = (onlySelected = false) => {
    if (!canExportCsv) {
      setUpgradeModalOpen(true)
      setUpgradeReason('csv')
      return
    }
    const selected = new Set(selectedLeadIds)
    const exported = onlySelected ? visibleLeads.filter((l) => selected.has(l.id)) : visibleLeads
    if (exported.length === 0) return
    track('csv_exported', { leadsCount: exported.length })
    const headers = ['Prénom', 'Nom', 'Email', 'Entreprise', 'Titre', 'Secteur', 'Score', 'Badge', 'Statut']
    const rows = exported.map((l) => [
      l.firstName, l.lastName, l.email,
      l.company ?? '', l.title ?? '', l.industry ?? '',
      l.aiScore ?? '', l.scoreBadge, LEAD_STATUS_CSV[l.status] ?? l.status,
    ])
    logExport('leads', rows.length)
    downloadCsv(`leads-phantera-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows))
  }

  // Stats: `realTotal` is the DB count; `leads` holds at most the 500 loaded.
  const totalLeads = leads.length
  const realTotal  = Math.max(totalLeadCount ?? 0, totalLeads)
  const isCapped   = realTotal > totalLeads
  // Ready to contact: the badges a campaign sends to (lib/leads/badges), not a third threshold.
  const qualifiedLeads = leads.filter((l) => isSendable(l.scoreBadge)).length
  const enrichedLeads = leads.filter((l) => l.enrichment?.emailVerified).length
  const convertedLeads = leads.filter((l) => l.status === 'converted').length
  const isLoading = progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error'

  // Machine figures in cyan, the rest neutral, a conversion in the success tone.
  // No previous period on this screen: no trend is shown.
  const statCards: MetricData[] = [
    { id: 'total', label: 'Total leads', value: realTotal, previousValue: null, trend: 'flat', color: 'var(--brand-primary)', caption: isCapped ? `${totalLeads} affichés (les mieux scorés)` : `sur ${realTotal} leads` },
    { id: 'ready', label: 'Prêts à contacter', value: qualifiedLeads, previousValue: null, trend: 'flat', color: 'var(--brand-primary)', caption: isCapped ? `Fast Track et Normal, sur les ${totalLeads} affichés` : 'priorité Fast Track ou Normal' },
    { id: 'verified', label: 'E-mail vérifié', value: enrichedLeads, previousValue: null, trend: 'flat', color: 'rgb(var(--c-muted))', caption: `sur ${totalLeads} affichés` },
    { id: 'converted', label: 'Convertis', value: convertedLeads, previousValue: null, trend: 'flat', color: 'var(--success-fg)', caption: `sur ${totalLeads} affichés` },
  ]

  return (
    <div className="space-y-6 pb-8">
      {/* Header: static (the load-time entrance was a CLS source) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-obsidian">
            <Users className="h-4 w-4 text-cyan" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Base de Leads</h1>
            <p className="text-xs text-muted">
              {realTotal.toLocaleString('fr-FR')} lead{realTotal !== 1 ? 's' : ''}
              {serverResults
                ? ` · ${serverResults.total.toLocaleString('fr-FR')} trouvé${serverResults.total > 1 ? 's' : ''} dans toute la base`
                : isCapped && ` (${totalLeads} affichés)`} •{' '}
              {qualifiedLeads} prêt{qualifiedLeads !== 1 ? 's' : ''} à contacter
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 max-md:w-full max-md:overflow-x-auto max-md:-mx-1 max-md:px-1 max-md:pb-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportCSV()}
            disabled={leads.length === 0}
            title={canExportCsv ? 'Exporter les leads en CSV' : 'Export CSV : réservé aux offres payantes'}
            className="shrink-0 gap-2 px-3 text-xs"
          >
            {canExportCsv ? (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
            )}
            <span className="max-md:sr-only">Exporter CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddLeadOpen(true)}
            className="shrink-0 gap-2 px-3 text-xs"
            title="Ajouter un lead manuellement (test email)"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="max-sm:sr-only">Ajouter</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setDrawerOpen(true)}
            disabled={isLoading}
            className="shrink-0 gap-2 px-3 text-xs"
          >
            {isLoading ? (
              <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isLoading ? 'Prospection en cours...' : 'Prospecter IA'}
          </Button>
        </div>
      </div>

      <div className="h-px bg-border" aria-hidden="true" />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((metric, i) => (
          <MetricCard key={metric.id} metric={metric} index={i} />
        ))}
      </div>

      {/* Bulk actions bar */}
      {selectedLeadIds.length > 0 && (
        <m.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
          className="flex items-center gap-3 rounded-[10px] border border-cyan/25 bg-obsidian px-4 py-2.5 max-md:flex-wrap"
        >
          <span className="rounded-full bg-cyan px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-void">
            {selectedLeadIds.length}
          </span>
          <span className="text-xs font-semibold text-cyan">sélectionné(s)</span>
          <div className="h-3 w-px bg-border/60" />
          <button
            onClick={handleBulkEnrich}
            disabled={isBulkEnriching}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-signal hover:border-cyan/30 hover:text-white disabled:opacity-50"
          >
            {isBulkEnriching ? 'Enrichissement...' : 'Enrichir'}
          </button>
          <button
            onClick={handleBulkScore}
            disabled={isBulkScoring}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-signal hover:border-cyan/30 hover:text-white disabled:opacity-50"
          >
            {isBulkScoring ? 'Calcul des scores...' : 'Scorer IA'}
          </button>
          <button
            onClick={() => setAssignModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-signal hover:border-cyan/30 hover:text-white"
          >
            <Target className="h-3 w-3" aria-hidden="true" />
            Assigner à campagne
          </button>
          <button
            onClick={() => handleExportCSV(true)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-signal hover:border-cyan/30 hover:text-white"
          >
            Exporter sélection
          </button>
          <button
            onClick={() => setSelectedLeadIds([])}
            className="ml-auto text-xs text-muted transition-colors hover:text-white"
          >
            Désélectionner
          </button>
        </m.div>
      )}

      {/* Table */}
      <div>
        <LeadsTable
          leads={visibleLeads}
          selectedIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
          onQueryChange={handleQueryChange}
          searching={searching}
          onLeadUpdated={handleLeadUpdated}
        />
      </div>

      {/* Search drawer */}
      <LeadSearchDrawer
        open={drawerOpen}
        workspaceId={workspaceId}
        plan={plan}
        onClose={() => setDrawerOpen(false)}
        onSearch={handleSearch}
        onUpgrade={(minPlan) => {
          setUpgradeReason(minPlan === 'PRO' ? 'ai' : 'leads')
          setUpgradeModalOpen(true)
        }}
        isLoading={isLoading}
      />

      {/* Pipeline progress */}
      <LeadSearchProgress
        state={progress}
        onDismiss={() => setProgress(INITIAL_PROGRESS)}
      />

      {/* Add lead modal */}
      <AddLeadModal
        open={addLeadOpen}
        workspaceId={workspaceId}
        campaigns={campaigns}
        onClose={() => setAddLeadOpen(false)}
        onLeadAdded={handleLeadAdded}
      />

      {/* Upgrade modal: shown when quota exceeded OR Pro feature attempted */}
      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason={upgradeReason}
        currentPlan={plan}
        annualPlans={annualPlans}
      />

      {/* Assign to campaign modal */}
      <AssignCampaignModal
        open={assignModalOpen}
        workspaceId={workspaceId}
        leadIds={selectedLeadIds}
        campaigns={campaigns}
        onClose={() => setAssignModalOpen(false)}
        onAssigned={(_campaignId, _count) => {
          // No visual change needed: assignment is persisted in DB.
          // Just clear the selection so the bulk bar disappears.
          setSelectedLeadIds([])
        }}
      />
    </div>
  )
}
