'use client'

/** Step 4: AI prospecting (volume) or leads already in the base (leads.available), picked one by one. */
import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Database, Loader2, Search, Zap } from 'lucide-react'
import { Button } from '@/components/ui'
import { StepHeader, choiceClass } from '@/components/dashboard/campaign-wizard/StepHeader'
import { step4Copy as t, wizardCopy } from '@/lib/copy/campaign-wizard'
import { api } from '@/lib/front/api'
import type { AvailableLeadRow } from '@/lib/front/types-campaigns'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { cn } from '@/lib/utils'

const ICONS = { ai: Zap, manual: Database } as const
const PRESETS = [50, 100, 200, 500, 1000]
/** One campaign creation attaches at most this many leads. */
const MAX_PICKED_LEADS = 1000

function AIProspectionConfig({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
  return (
    <div className="mt-5 rounded-lg border border-accent/25 bg-raised p-5">
      <p id="ai-volume-label" className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink"><Zap className="h-4 w-4 text-accent" aria-hidden="true" />{t.volume}</p>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-labelledby="ai-volume-label">
        {PRESETS.map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={volume === n}
            className={cn('rounded-md border px-4 py-1.5 font-mono text-xs font-bold tabular-nums transition-colors duration-200 ease-signal',
              volume === n ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-quiet hover:border-quiet/50 hover:text-ink')}>
            {t.leads(n)}
          </button>
        ))}
      </div>
      <ul className="grid gap-1.5">
        {t.features.map((feat) => (
          <li key={feat} className="flex items-center gap-2 text-xs text-quiet"><Check className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />{feat}</li>
        ))}
      </ul>
      <div className="mt-4 rounded-md border border-line bg-canvas px-4 py-2.5">
        <p className="font-mono text-xs text-quiet">{t.goodToKnow}</p>
        <p className="text-xs text-ink/80">{t.goodToKnowBody(volume)}</p>
      </div>
    </div>
  )
}

// Leads already in Phantera, in no campaign, contactable: the campaign is
// created with them and its first message is queued at once.
function ExistingBaseConfig({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [leads, setLeads] = useState<AvailableLeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.call('leads.available', { query: { q: query.trim() } }, { signal: controller.signal })
        setLeads(res.data.leads)
        setTotal(res.data.total)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(t.loadError)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const selectedSet = new Set(selected)
  const visibleIds = leads.map((l) => l.id)
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))
  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selected.filter((x) => x !== id))
    else if (selected.length < MAX_PICKED_LEADS) onChange([...selected, id])
  }
  const toggleVisible = () => {
    if (allVisible) onChange(selected.filter((id) => !visibleIds.includes(id)))
    else onChange([...new Set([...selected, ...visibleIds])].slice(0, MAX_PICKED_LEADS))
  }

  return (
    <div className="mt-5 rounded-lg border border-line bg-raised">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-quiet" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder={t.searchPh} aria-label={t.search}
            className="h-9 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-xs text-ink outline-none transition-colors duration-200 ease-signal placeholder:text-quiet/60 focus:border-accent/50" />
        </div>
        <Button variant="outline" size="sm" onClick={toggleVisible} disabled={visibleIds.length === 0} className="h-9 px-3 text-xs">
          {allVisible ? t.unselectAll : t.selectAll(visibleIds.length)}
        </Button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {loading && leads.length === 0 ? (
          <p className="flex items-center justify-center gap-2 p-6 text-xs text-quiet"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t.loading}</p>
        ) : error ? (
          <p className="p-6 text-center text-xs text-danger" role="alert">{error}</p>
        ) : leads.length === 0 ? (
          <p className="p-6 text-center text-xs text-quiet">{query ? t.noneForQuery : t.none}</p>
        ) : leads.map((lead) => {
          const checked = selectedSet.has(lead.id)
          return (
            <label key={lead.id} className={cn('flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 transition-colors duration-200 ease-signal last:border-b-0', checked ? 'bg-accent/[0.04]' : 'hover:bg-surface/50')}>
              <input type="checkbox" checked={checked} onChange={() => toggle(lead.id)} className="h-3.5 w-3.5 accent-[rgb(var(--c-cyan))]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">{lead.firstName} {lead.lastName}</span>
                <span className="block truncate text-xs text-quiet">{[lead.title, lead.company].filter(Boolean).join(', ') || '-'}</span>
              </span>
              {lead.aiScore !== null && <span className="font-mono text-xs tabular-nums text-quiet" title={t.scoreTitle}>{lead.aiScore}</span>}
            </label>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 font-mono text-xs tabular-nums">
        <span className={selected.length > 0 ? 'font-semibold text-accent' : 'text-quiet'}>{t.selected(selected.length)}</span>
        <span className="text-quiet">{total > leads.length ? t.shown(leads.length, total) : t.available(total)}</span>
      </div>
    </div>
  )
}

export function Step4Leads() {
  const { data, updateStep4, nextStep, prevStep } = useCampaignWizard()
  const { step4 } = data
  const canProceed = step4.leadSource === 'ai' || (step4.leadSource === 'manual' && (step4.leadIds?.length ?? 0) > 0)

  return (
    <div className="mx-auto max-w-2xl">
      <StepHeader step={4} title={t.title} intro={t.intro} />
      <div className="mb-2 space-y-3" role="group" aria-label={t.groupLabel}>
        {t.sources.map(({ key, label, desc, badge }) => {
          const selected = step4.leadSource === key
          const Icon = ICONS[key]
          return (
            <button key={key} type="button" aria-pressed={selected} onClick={() => updateStep4({ leadSource: key })}
              className={cn('w-full rounded-lg border p-4 text-left transition-colors duration-200 ease-signal', choiceClass(selected))}>
              <span className="flex items-start gap-3">
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border', selected ? 'border-accent/40 text-accent' : 'border-line text-quiet')}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('text-sm font-bold', selected ? 'text-ink' : 'text-ink/80')}>{label}</span>
                    {badge && <span className="font-mono text-xs text-accent">{badge}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-quiet">{desc}</span>
                </span>
                <span aria-hidden="true" className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-accent bg-accent' : 'border-line')}>
                  {selected && <Check className="h-3 w-3 text-canvas" />}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {step4.leadSource === 'ai' && <AIProspectionConfig volume={step4.estimatedLeads} onChange={(v) => updateStep4({ estimatedLeads: v })} />}
      {step4.leadSource === 'manual' && <ExistingBaseConfig selected={step4.leadIds ?? []} onChange={(ids) => updateStep4({ leadIds: ids })} />}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" size="lg" onClick={prevStep} className="px-5"><ChevronLeft className="h-4 w-4" aria-hidden="true" />{wizardCopy.previous}</Button>
        <Button size="lg" onClick={nextStep} disabled={!canProceed} title={canProceed ? undefined : t.needLead} className="px-6">{t.next}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>
  )
}
