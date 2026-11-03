'use client'

/**
 * /dashboard/leads: the lead base. Header figures, search over the whole
 * base past the 500 loaded, bulk actions (enrich, score, assign, export),
 * manual add, the AI sourcing run with its progress, and the upgrade dialog
 * when a quota or a paid feature is reached. Same endpoints and inputs as
 * body n°1 (LeadsPageClient).
 */

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Lock, RefreshCw, Target, UserPlus, Zap } from 'lucide-react'
import { AppPage } from '@/components/app/AppPage'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { isSendable } from '@/lib/leads/badges'
import { downloadCsv, toCsv } from '@/lib/export/csv'
import { leadsCopy as t, type UpgradeReason } from '@/lib/copy/leads'
import type { LeadRow, LeadSearchParams, LeadsView } from '@/lib/front/types-leads'
import { AddLeadModal } from './AddLeadModal'
import { AssignCampaignModal } from './AssignCampaignModal'
import { LeadSearchDrawer } from './LeadSearchDrawer'
import { LeadSearchProgress, consumePipeline, type ProgressState } from './LeadSearchProgress'
import { LeadsTable } from './LeadsTable'
import { UpgradeModal } from './UpgradeModal'
import { apiErrorMessage } from './errors'
import { track } from './track'

/** The scoring endpoint's limit (leads.score: 100 leads). */
const MAX_SCORE_BATCH = 100
/** The e-mail check endpoint's limit (leads.enrichBatch: 25 leads). */
const MAX_ENRICH_BATCH = 25

const INITIAL_PROGRESS: ProgressState = {
  phase: 'idle', searchFound: 0, searchTotal: 0, enriched: 0, enrichTotal: 0, scored: 0, scoreTotal: 0, summary: null, error: null,
}

const BULK_BUTTON = 'rounded-md border border-line px-3 py-1.5 text-xs text-ink transition-colors duration-200 ease-signal hover:border-accent disabled:opacity-50'

/** An instrument figure, the home screen's MetricCard look, without trend (no previous period here). */
function Stat({ label, value, caption, tick }: { label: string; value: number; caption: string; tick: string }) {
  return (
    <div className="relative rounded-lg border border-line bg-raised p-4 md:p-5">
      <span className={cn('absolute left-5 top-0 h-px w-8', tick)} aria-hidden="true" />
      <p className="mb-3 font-mono text-xs text-quiet">{label}</p>
      <p className="font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums md:text-[2rem]">
        {value.toLocaleString('fr-FR')}
      </p>
      <p className="mt-3 text-xs text-quiet">{caption}</p>
    </div>
  )
}

export function LeadsScreen({ view }: { view: LeadsView }) {
  const { workspaceId, campaigns, plan, totalLeadCount, annualPlans } = view
  const [leads, setLeads] = useState<LeadRow[]>(view.leads)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [isBulkEnriching, setIsBulkEnriching] = useState(false)
  const [isBulkScoring, setIsBulkScoring] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>('leads')
  const abortRef = useRef<AbortController | null>(null)
  const router = useRouter()

  // The page holds the best 500 leads. Past that, a search or a status filter
  // is answered by the server over the whole base.
  const [serverResults, setServerResults] = useState<{ leads: LeadRow[]; total: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)
  const isBaseCapped = totalLeadCount > leads.length

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
        const data = await api.call('leads.list', { query: { workspaceId, q: query.trim(), status } })
        if (seq === searchSeq.current) setServerResults({ leads: data.data, total: data.total ?? data.data.length })
      } catch {
        if (seq === searchSeq.current) setServerResults(null)
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 300)
  }, [isBaseCapped, workspaceId])

  const visibleLeads = serverResults?.leads ?? leads

  /** Applies a change to the loaded leads and to the server results shown. */
  const patchLeads = useCallback((fn: (list: LeadRow[]) => LeadRow[]) => {
    setLeads(fn)
    setServerResults((current) => (current ? { ...current, leads: fn(current.leads) } : current))
  }, [])

  const handleLeadUpdated = useCallback((updated: LeadRow) => {
    patchLeads((list) => list.map((l) => (l.id === updated.id ? updated : l)))
  }, [patchLeads])

  const handleSearch = useCallback(async (params: LeadSearchParams) => {
    setDrawerOpen(false)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    track('first_search_launched', { limit: params.limit ?? 25, industry: params.industry })
    setProgress({ ...INITIAL_PROGRESS, phase: 'search', searchTotal: params.limit ?? 25 })

    try {
      await consumePipeline(params, (event) => {
        if (event.type === 'pipeline_done') {
          setLeads((current) => {
            const existing = new Set(current.map((l) => l.id))
            const toAdd = event.leads.filter((l) => !existing.has(l.id))
            if (toAdd.length > 0) track('first_lead_saved', { source: 'apollo' })
            return [...toAdd, ...current]
          })
        }
        if (event.type === 'error') {
          // A quota reached: the offers that lift it.
          const msg = event.message.toLowerCase()
          if (msg.includes('quota') || msg.includes('limit')) {
            setUpgradeReason('leads')
            setUpgradeModalOpen(true)
          }
        }
        setProgress((prev) => {
          switch (event.type) {
            case 'search_start': return { ...prev, phase: 'search', searchTotal: event.total }
            case 'search_progress': return { ...prev, searchFound: event.found }
            case 'search_done': return { ...prev, searchFound: event.saved }
            case 'enrich_start': return { ...prev, phase: 'enrich', enrichTotal: event.total }
            case 'enrich_progress': return { ...prev, enriched: event.enriched, enrichTotal: event.total }
            case 'enrich_done': return { ...prev, enriched: event.verified }
            case 'score_start': return { ...prev, phase: 'score', scoreTotal: event.total }
            case 'score_progress': return { ...prev, scored: event.scored, scoreTotal: event.total }
            case 'score_done': return { ...prev, scored: prev.scoreTotal }
            case 'pipeline_done': return { ...prev, phase: 'done', summary: event.summary }
            case 'error': return { ...prev, phase: 'error', error: event.message }
            default: return prev
          }
        })
      }, abortRef.current.signal)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setProgress((prev) => ({ ...prev, phase: 'error', error: err.message }))
      }
    } finally {
      // Leads may have been saved even when the run ends in an error: reload the server count.
      router.refresh()
    }
  }, [router])

  const handleBulkEnrich = async () => {
    if (selectedLeadIds.length === 0) return
    setIsBulkEnriching(true)
    try {
      const data = await api.call('leads.enrichBatch', { body: { workspaceId, leadIds: selectedLeadIds.slice(0, MAX_ENRICH_BATCH) } })
      const enrichMap = new Map(data.data.results.map((r) => [r.leadId, r]))
      patchLeads((list) => list.map((lead) => {
        const enriched = enrichMap.get(lead.id)
        if (!enriched) return lead
        return {
          ...lead,
          enrichment: {
            ...lead.enrichment,
            emailVerified: enriched.emailVerified,
            emailConfidence: enriched.emailConfidence,
            emailStatus: enriched.emailStatus,
          },
        }
      }))
    } catch {
      // non-fatal
    } finally {
      setIsBulkEnriching(false)
    }
  }

  const handleBulkScore = async () => {
    if (selectedLeadIds.length === 0) return
    if (selectedLeadIds.length > MAX_SCORE_BATCH) {
      toast.error(t.scoreToasts.tooMany(MAX_SCORE_BATCH, selectedLeadIds.length))
      return
    }
    setIsBulkScoring(true)
    try {
      const data = await api.call('leads.score', { body: { workspaceId, leadIds: selectedLeadIds } })
      const d = data.data.distribution
      const parts = t.scoreToasts.distribution.filter(([k]) => (d[k] ?? 0) > 0).map(([k, label]) => `${d[k]} ${label}`)
      toast.success(t.scoreToasts.done(data.data.scored ?? 0, parts))
      if ((d.UNSCORED ?? 0) > 0) toast.warning(t.scoreToasts.unscored(d.UNSCORED))
      const refreshed = await api.call('leads.list', { query: { workspaceId } }).catch(() => null)
      if (refreshed?.data) setLeads(refreshed.data)
    } catch (err) {
      toast.error(err instanceof TypeError ? t.scoreToasts.network : apiErrorMessage(err, t.scoreToasts.failed))
    } finally {
      setIsBulkScoring(false)
    }
  }

  const handleLeadAdded = useCallback((lead: LeadRow) => {
    setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]))
    router.refresh()
  }, [router])

  // CSV export is a paid feature: gated before the file is built.
  const canExportCsv = plan !== 'FREE'

  // From the selection bar, only the selected leads are exported.
  const handleExportCSV = (onlySelected = false) => {
    if (!canExportCsv) {
      setUpgradeReason('csv')
      setUpgradeModalOpen(true)
      return
    }
    const selected = new Set(selectedLeadIds)
    const exported = onlySelected ? visibleLeads.filter((l) => selected.has(l.id)) : visibleLeads
    if (exported.length === 0) return
    track('csv_exported', { leadsCount: exported.length })
    const rows = exported.map((l) => [
      l.firstName, l.lastName, l.email,
      l.company ?? '', l.title ?? '', l.industry ?? '',
      l.aiScore ?? '', l.scoreBadge, t.csv.status[l.status] ?? l.status,
    ])
    // Leaves the export in the workspace's audit log (best effort: the file is already the member's).
    void api.call('leads.logExport', { body: { kind: 'leads', count: rows.length } }, { keepalive: true }).catch(() => {})
    downloadCsv(t.csv.filename(new Date().toISOString().slice(0, 10)), toCsv([...t.csv.headers], rows))
  }

  // `realTotal` is the database count; `leads` holds at most the 500 loaded.
  const shown = leads.length
  const realTotal = Math.max(totalLeadCount, shown)
  const isCapped = realTotal > shown
  // Ready to contact: the badges a campaign sends to (lib/leads/badges).
  const ready = leads.filter((l) => isSendable(l.scoreBadge)).length
  const verified = leads.filter((l) => l.enrichment?.emailVerified).length
  const converted = leads.filter((l) => l.status === 'converted').length
  const isLoading = progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error'

  const actions = (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExportCSV()}
        disabled={leads.length === 0}
        title={canExportCsv ? t.exportTitle : t.exportLockedTitle}
      >
        {canExportCsv ? <Download className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4 text-quiet" aria-hidden="true" />}
        <span className="max-md:sr-only">{t.exportCsv}</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => setAddLeadOpen(true)} title={t.addTitle}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        <span className="max-sm:sr-only">{t.add}</span>
      </Button>
      <Button size="sm" onClick={() => setDrawerOpen(true)} disabled={isLoading}>
        {isLoading
          ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          : <Zap className="h-4 w-4" aria-hidden="true" />}
        <span className="max-sm:sr-only">{isLoading ? t.prospecting : t.prospect}</span>
      </Button>
    </>
  )

  return (
    <AppPage
      title={t.title}
      description={t.description({ realTotal, shown, capped: isCapped, found: serverResults?.total ?? null, ready })}
      actions={actions}
      className="space-y-6 pb-8"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.stats.total} value={realTotal} caption={t.stats.totalCaption(shown, realTotal, isCapped)} tick="bg-accent" />
        <Stat label={t.stats.ready} value={ready} caption={t.stats.readyCaption(shown, isCapped)} tick="bg-accent" />
        <Stat label={t.stats.verified} value={verified} caption={t.stats.shownCaption(shown)} tick="bg-quiet" />
        <Stat label={t.stats.converted} value={converted} caption={t.stats.shownCaption(shown)} tick="bg-success" />
      </div>

      {selectedLeadIds.length > 0 && (
        <div role="region" aria-label={t.bulk.label} className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-raised px-4 py-2.5">
          <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-xs tabular-nums text-canvas">{selectedLeadIds.length}</span>
          <span className="text-xs text-accent">{t.bulk.selected}</span>
          <span className="h-3 w-px bg-line" aria-hidden="true" />
          <button type="button" onClick={handleBulkEnrich} disabled={isBulkEnriching} className={BULK_BUTTON}>
            {isBulkEnriching ? t.bulk.enriching : t.bulk.enrich}
          </button>
          <button type="button" onClick={handleBulkScore} disabled={isBulkScoring} className={BULK_BUTTON}>
            {isBulkScoring ? t.bulk.scoring : t.bulk.score}
          </button>
          <button type="button" onClick={() => setAssignModalOpen(true)} className={cn(BULK_BUTTON, 'inline-flex items-center gap-1.5')}>
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            {t.bulk.assign}
          </button>
          <button type="button" onClick={() => handleExportCSV(true)} className={BULK_BUTTON}>{t.bulk.exportSelection}</button>
          <button
            type="button"
            onClick={() => setSelectedLeadIds([])}
            className="ml-auto text-xs text-quiet transition-colors duration-200 ease-signal hover:text-ink"
          >
            {t.bulk.clear}
          </button>
        </div>
      )}

      <LeadsTable
        leads={visibleLeads}
        selectedIds={selectedLeadIds}
        onSelectionChange={setSelectedLeadIds}
        onQueryChange={handleQueryChange}
        searching={searching}
        onLeadUpdated={handleLeadUpdated}
      />

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

      <LeadSearchProgress state={progress} onDismiss={() => setProgress(INITIAL_PROGRESS)} />

      <AddLeadModal
        open={addLeadOpen}
        workspaceId={workspaceId}
        campaigns={campaigns}
        onClose={() => setAddLeadOpen(false)}
        onLeadAdded={handleLeadAdded}
      />

      <UpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} reason={upgradeReason} annualPlans={annualPlans} />

      <AssignCampaignModal
        open={assignModalOpen}
        workspaceId={workspaceId}
        leadIds={selectedLeadIds}
        campaigns={campaigns}
        onClose={() => setAssignModalOpen(false)}
        // Assignment is persisted on the server: clear the selection so the bar goes.
        onAssigned={() => setSelectedLeadIds([])}
      />
    </AppPage>
  )
}
