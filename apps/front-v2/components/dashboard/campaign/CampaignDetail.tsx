'use client'

/**
 * The campaign page under its header: send state (retry, uncertain e-mails,
 * live prospecting), alerts, sender, and three tabs (Résumé, Étapes, Leads)
 * with the inline AI prospecting (leads.searchStream). Same data, calls and
 * auto-refresh rules as body n°1's CampaignDetailClient.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, BarChart3, Check, Mail, RefreshCw, Users, X } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { InsightsPanel } from '@/components/dashboard/shared/InsightsPanel'
import { CampaignSenderCard } from '@/components/dashboard/campaign/CampaignSenderCard'
import { LeadSearchDrawer } from '@/components/dashboard/campaign/LeadSearchDrawer'
import { INITIAL_PROGRESS, LeadSearchProgress, usePipelineStream, type ProgressState } from '@/components/dashboard/campaign/LeadSearchProgress'
import { LeadsTab } from '@/components/dashboard/campaign/LeadsTab'
import { ResumeTab, messagesBreakdown } from '@/components/dashboard/campaign/ResumeTab'
import { SendStatusBanner } from '@/components/dashboard/campaign/SendStatusBanner'
import { StepComparisonTable } from '@/components/dashboard/campaign/StepComparisonTable'
import { campaignCopy as t } from '@/lib/copy/campaign'
import { api } from '@/lib/front/api'
import type {
  CampaignDetailData, CampaignLeadCounts, CampaignLeadRow, CampaignStepStats, LeadSearchParams, WorkspacePlan,
} from '@/lib/front/types-campaigns'
import type { LeadWithEnrichment } from '@/lib/types/lead'
import { cn } from '@/lib/utils'

type Tab = 'resume' | 'steps' | 'leads'
const TABS: { key: Tab; Icon: typeof BarChart3 }[] = [{ key: 'resume', Icon: BarChart3 }, { key: 'steps', Icon: Mail }, { key: 'leads', Icon: Users }]
type CompanySize = 'XS' | 'S' | 'M' | 'L' | 'XL'

/** Outcome of a user action, carried as data, never read back from a glyph. */
interface ActionResult { ok: boolean; text: string }

function ActionResultLine({ result }: { result: ActionResult }) {
  const Icon = result.ok ? Check : X
  return (
    <p role="status" className={cn('mt-1 flex items-center gap-1 text-xs', result.ok ? 'text-success' : 'text-danger')}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {result.text}
    </p>
  )
}

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? (err.body?.error ?? fallback) : err instanceof Error ? err.message : t.networkError

function pipelineLeadToRow(l: LeadWithEnrichment): CampaignLeadRow {
  return {
    id: l.id, firstName: l.firstName, lastName: l.lastName, email: l.email, company: l.company, title: l.title,
    status: l.status, scoreBadge: l.scoreBadge, lastReplyAt: null, lastReplyClassification: null, industry: l.industry,
    linkedinUrl: l.linkedinUrl, website: l.website, country: l.country, companySize: l.companySize, source: l.source,
    apolloId: l.apolloId, aiScore: l.aiScore, scoreReason: l.scoreReason, createdAt: l.createdAt, enrichment: l.enrichment,
  }
}

function computeLeadCounts(leads: CampaignLeadRow[]): CampaignLeadCounts {
  const counts: CampaignLeadCounts = { total: leads.length, new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
  for (const l of leads) {
    const key = l.status as keyof Omit<CampaignLeadCounts, 'total'>
    if (key in counts) counts[key]++
  }
  return counts
}

const mergeLeadCounts = (a: CampaignLeadCounts, b: CampaignLeadCounts): CampaignLeadCounts => ({
  total: Math.max(a.total, b.total), new: Math.max(a.new, b.new), contacted: Math.max(a.contacted, b.contacted),
  qualified: Math.max(a.qualified, b.qualified), converted: Math.max(a.converted, b.converted), lost: Math.max(a.lost, b.lost),
})

export function CampaignDetail({
  campaign, stepStats, leadCounts: initialLeadCounts, leads: initialLeads, workspaceId, plan,
  pendingCount: initialPendingCount, unverifiedCount: initialUnverifiedCount,
}: {
  campaign: CampaignDetailData
  stepStats: CampaignStepStats[]
  leadCounts: CampaignLeadCounts
  leads: CampaignLeadRow[]
  workspaceId: string
  /** The workspace's real plan: drives the locked filters of the lead search. */
  plan: WorkspacePlan
  /** Sends stuck in PENDING: surfaced as a « relancer » button. */
  pendingCount: number
  /** Qualified leads with an uncertain e-mail, held from auto-send. */
  unverifiedCount: number
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('resume')
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1
    const next = e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    setActiveTab(TABS[next].key)
    tabRefs.current[next]?.focus()
  }

  const [liveLeads, setLiveLeads] = useState<CampaignLeadRow[]>(initialLeads)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS)
  const [pendingCount, setPendingCount] = useState(initialPendingCount)
  const [retrying, setRetrying] = useState(false)
  const [retryMsg, setRetryMsg] = useState<ActionResult | null>(null)
  const [autoPolling, setAutoPolling] = useState(false)
  const [unverifiedCount, setUnverifiedCount] = useState(initialUnverifiedCount)
  const [contacting, setContacting] = useState(false)
  const [contactMsg, setContactMsg] = useState<ActionResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Read inside the polling interval without stale closures. Leads are saved
  // before they are scored: polling continues until no UNSCORED is left.
  const leadCountRef = useRef(initialLeads.length)
  const hasUnscoredRef = useRef(initialLeads.some((l) => l.scoreBadge === 'UNSCORED'))
  const phaseRef = useRef(progress.phase)
  useEffect(() => { phaseRef.current = progress.phase }, [progress.phase])

  const handleRetryPending = async () => {
    if (retrying) return
    setRetrying(true)
    setRetryMsg(null)
    try {
      const { stats } = await api.call('campaigns.retryPending', { params: { campaignId: campaign.id } })
      setRetryMsg(stats.active ? { ok: true, text: t.retried(stats.queued) } : { ok: false, text: t.retryPaused })
      setPendingCount(stats.queued)
      router.refresh()
    } catch (err) {
      setRetryMsg({ ok: false, text: errorText(err, t.retryError) })
    } finally {
      setRetrying(false)
      setTimeout(() => setRetryMsg(null), 6000)
    }
  }

  const handleContactUnverified = async () => {
    if (contacting) return
    setContacting(true)
    setContactMsg(null)
    try {
      const { stats } = await api.call('campaigns.contactUnverified', { params: { campaignId: campaign.id } })
      setContactMsg({ ok: true, text: t.contacted(stats.queued) })
      setUnverifiedCount(0)
      router.refresh()
    } catch (err) {
      setContactMsg({ ok: false, text: errorText(err, t.error) })
    } finally {
      setContacting(false)
      setTimeout(() => setContactMsg(null), 6000)
    }
  }

  const { consume } = usePipelineStream()

  useEffect(() => { setUnverifiedCount(initialUnverifiedCount) }, [initialUnverifiedCount])

  const liveLeadCounts = mergeLeadCounts(initialLeadCounts, computeLeadCounts(liveLeads))
  const isLoading = progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error'

  // Right after creation the background prospecting saves leads in one burst
  // at the end of its run: refresh every 4 s until leads arrived, stopped
  // growing and are scored (5 min cap). Only for a fresh AI-prospecting
  // campaign that is not a draft.
  useEffect(() => {
    if (Date.now() - new Date(campaign.createdAt).getTime() > 6 * 60_000) return
    if (initialLeads.length >= 100) return
    if (campaign.leadSource !== 'AI_PROSPECTING') return
    if (campaign.status === 'DRAFT') return

    setAutoPolling(true)
    let stable = 0
    let last = leadCountRef.current
    let sawLeads = leadCountRef.current > 0
    let ticks = 0
    const MAX_TICKS = 75
    const stop = () => { clearInterval(interval); setAutoPolling(false) }
    const interval = setInterval(() => {
      ticks++
      if (ticks > MAX_TICKS) return stop()
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'done') return // a manual run is going
      router.refresh()
      const n = leadCountRef.current
      if (n > 0) sawLeads = true
      if (n === last && !hasUnscoredRef.current) {
        if (sawLeads) { stable++; if (stable >= 2) stop() }
      } else {
        stable = 0
        last = n
      }
    }, 4_000)
    return () => stop()
    // Once per campaign mount; the interval reads live state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id])

  // After router.refresh, the new server props replace the list (tab kept).
  useEffect(() => {
    setLiveLeads(initialLeads)
    leadCountRef.current = initialLeads.length
    hasUnscoredRef.current = initialLeads.some((l) => l.scoreBadge === 'UNSCORED')
  }, [initialLeads])

  const handleSearch = useCallback(async (params: LeadSearchParams) => {
    setDrawerOpen(false)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setProgress({ ...INITIAL_PROGRESS, phase: 'search', searchTotal: params.limit ?? 25 })

    try {
      await consume(params, (event) => {
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
            case 'pipeline_done': {
              const fresh = event.leads.map(pipelineLeadToRow)
              setLiveLeads((current) => {
                const ids = new Set(current.map((l) => l.id))
                return [...fresh.filter((l) => !ids.has(l.id)), ...current]
              })
              return { ...prev, phase: 'done', summary: event.summary }
            }
            case 'error': return { ...prev, phase: 'error', error: event.message }
            default: return prev
          }
        })
      }, abortRef.current.signal)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setProgress((prev) => ({ ...prev, phase: 'error', error: err.message }))
    }
  }, [consume])

  const status = campaign.status.toLowerCase()
  const breakdown = messagesBreakdown(campaign.messagesByChannel)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()} aria-label={t.back} className="h-8 w-8 shrink-0 px-0">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-1 gap-y-1 pt-1.5 font-mono text-xs tabular-nums text-quiet">
            {t.leadsCount(liveLeadCounts.total)} · {breakdown ? t.sentSuffix(breakdown, campaign.sentCount) : t.noneSent}
            {pendingCount > 0 && (
              <>
                {' '}·{' '}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRetryPending()}
                  disabled={retrying}
                  title={t.retryTitle}
                  className="h-7 border-accent/30 px-2 font-mono text-xs text-accent hover:border-accent/50"
                >
                  {retrying ? t.retrying : t.inFlight(pendingCount)}
                </Button>
              </>
            )}
          </p>
          {retryMsg && <ActionResultLine result={retryMsg} />}
        </div>
      </div>

      <SendStatusBanner campaignId={campaign.id} initialQueued={pendingCount} />
      <InsightsPanel campaignId={campaign.id} />

      {status === 'draft' && liveLeadCounts.total === 0 && (
        <div className="rounded-lg border border-accent/25 bg-raised px-4 py-3 text-sm text-ink" role="status">
          <p className="font-semibold text-ink">{t.draftTitle}</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-quiet">
            <li>{t.draftStep1}</li>
            <li>{t.draftStep2Before}<Link href="/dashboard/campaigns" className="font-semibold text-accent hover:underline">{t.draftStep2Link}</Link>{t.draftStep2After}</li>
          </ol>
        </div>
      )}

      {autoPolling && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/25 bg-raised px-4 py-3" role="status">
          <RefreshCw className="h-4 w-4 shrink-0 text-accent motion-safe:animate-spin" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">
              {t.prospecting}
              {liveLeadCounts.total > 0 && <span className="ml-2 font-mono text-xs tabular-nums text-accent">{t.collected(liveLeadCounts.total)}</span>}
            </p>
            <p className="mt-0.5 text-xs text-quiet">{t.prospectingBody}</p>
          </div>
        </div>
      )}

      {unverifiedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/25 bg-raised px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-warning">{t.uncertain(unverifiedCount)}</p>
            <p className="mt-0.5 text-xs text-quiet">{t.uncertainBody}</p>
            {contactMsg && <ActionResultLine result={contactMsg} />}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleContactUnverified()} disabled={contacting} className="border-warning/40 hover:border-warning/60">
            {contacting ? <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Mail className="h-3.5 w-3.5" aria-hidden="true" />}
            {contacting ? t.contacting : t.contactAnyway}
          </Button>
        </div>
      )}

      <div role="tablist" aria-label={t.tabsLabel} className="flex items-center gap-1 rounded-lg border border-line bg-raised p-1">
        {TABS.map(({ key, Icon }, index) => (
          <button
            key={key}
            ref={(el) => { tabRefs.current[index] = el }}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${key}`}
            aria-selected={activeTab === key}
            aria-controls={`${tabsId}-panel`}
            tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setActiveTab(key)}
            onKeyDown={(e) => onTabKey(e, index)}
            className={cn(
              'flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors duration-200 ease-signal',
              activeTab === key ? 'bg-surface text-ink' : 'text-quiet hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.tabs[key]}
            {key === 'leads' && liveLeadCounts.total > 0 && <span className="font-mono text-xs tabular-nums text-quiet">{liveLeadCounts.total}</span>}
          </button>
        ))}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${activeTab}`} tabIndex={0} className="rounded-lg">
        {activeTab === 'resume' && (
          <div className="space-y-4">
            {campaign.status !== 'COMPLETED' && <CampaignSenderCard campaignId={campaign.id} />}
            <ResumeTab campaign={campaign} stepStats={stepStats} />
          </div>
        )}
        {activeTab === 'steps' && <StepComparisonTable steps={stepStats} />}
        {activeTab === 'leads' && <LeadsTab leads={liveLeads} leadCounts={liveLeadCounts} isLoading={isLoading} onFindLeads={() => setDrawerOpen(true)} />}
      </div>

      <LeadSearchDrawer
        open={drawerOpen}
        workspaceId={workspaceId}
        campaignId={campaign.id}
        plan={plan}
        onUpgrade={() => router.push(t.settingsBilling)}
        defaultTitles={campaign.targetTitles}
        defaultIndustry={campaign.targetIndustry ?? undefined}
        defaultSizes={campaign.targetCompanySizes as CompanySize[]}
        defaultCountry={campaign.targetGeos[0]}
        onClose={() => setDrawerOpen(false)}
        onSearch={(params) => void handleSearch(params)}
        isLoading={isLoading}
      />

      <LeadSearchProgress state={progress} onDismiss={() => setProgress(INITIAL_PROGRESS)} />
    </div>
  )
}
