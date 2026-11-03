'use client'

/**
 * The AI prospecting run of the campaign page (leads.searchStream, SSE):
 * the consumer hook and the floating progress card. Each step says what it
 * does, never which provider runs it.
 */
import { useCallback } from 'react'
import { AlertTriangle, ArrowRight, Check, CheckCircle, Gauge, Loader2, MailCheck, Search, X } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { SCORE_BADGE, progressCopy as t } from '@/lib/copy/campaign'
import { api } from '@/lib/front/api'
import type { LeadSearchParams } from '@/lib/front/types-campaigns'
import type { LeadScoreBadge, PipelineEvent, PipelineSummary } from '@/lib/types/lead'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'search' | 'enrich' | 'score' | 'done' | 'error'

export interface ProgressState {
  phase: Phase
  searchFound: number
  searchTotal: number
  enriched: number
  enrichTotal: number
  scored: number
  scoreTotal: number
  summary: PipelineSummary | null
  error: string | null
}

export const INITIAL_PROGRESS: ProgressState = {
  phase: 'idle', searchFound: 0, searchTotal: 0, enriched: 0, enrichTotal: 0, scored: 0, scoreTotal: 0, summary: null, error: null,
}

/** Reads the SSE stream of leads.searchStream, one `data: <json>` line per event. */
export function usePipelineStream() {
  const consume = useCallback(async (params: LeadSearchParams, onEvent: (event: PipelineEvent) => void, signal?: AbortSignal) => {
    let res: Response
    try {
      res = await api.call('leads.searchStream', { body: params }, { signal })
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.body?.error || t.notStarted)
      throw err
    }
    if (!res.body) throw new Error(t.notStarted)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try { onEvent(JSON.parse(line.slice(6)) as PipelineEvent) } catch { /* skip malformed events */ }
      }
    }
  }, [])
  return { consume }
}

const ICONS = { search: Search, enrich: MailCheck, score: Gauge } as const
const ORDER: Phase[] = ['search', 'enrich', 'score']
const BADGE_TONE: Record<string, string> = {
  success: 'text-success border-success/25',
  accent: 'text-accent border-accent/25',
  warning: 'text-warning border-warning/25',
  danger: 'text-danger border-danger/25',
}

export function LeadSearchProgress({ state, onDismiss }: { state: ProgressState; onDismiss?: () => void }) {
  if (state.phase === 'idle') return null
  const isDone = state.phase === 'done'
  const isError = state.phase === 'error'

  const progressOf = (id: Phase) => {
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
    if (id === 'search') return pct(state.searchFound, state.searchTotal)
    if (id === 'enrich') return pct(state.enriched, state.enrichTotal)
    if (id === 'score') return pct(state.scored, state.scoreTotal)
    return 0
  }
  const isComplete = (id: Phase) => {
    const idx = ORDER.indexOf(id)
    const cur = ORDER.indexOf(state.phase)
    return isDone || (idx >= 0 && cur > idx)
  }
  const subcount = (id: Phase) => {
    if (!isComplete(id)) return null
    if (id === 'search') return t.found(state.searchFound)
    if (id === 'enrich') return t.emails(state.enriched)
    if (id === 'score') return t.scored(state.scored)
    return null
  }
  const title = isDone ? t.done : isError ? t.failed : t.running

  return (
    <section aria-label={t.label} className="fixed bottom-6 right-6 z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-raised">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        {isDone ? <CheckCircle className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          : isError ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          : <Loader2 className="h-4 w-4 shrink-0 text-accent motion-safe:animate-spin" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-none text-ink" role="status">{title}</p>
          {!isDone && !isError && <p className="mt-1 font-mono text-[11px] text-quiet">{t.stepsInOrder(t.steps.length)}</p>}
        </div>
        {(isDone || isError) && onDismiss && (
          <button type="button" onClick={onDismiss} aria-label={t.close} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-quiet transition-colors hover:bg-surface hover:text-ink">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {isError && <div className="px-4 py-3"><p className="text-xs leading-relaxed text-danger" role="alert">{state.error}</p></div>}

      {!isError && (
        <ol className="space-y-2.5 px-4 py-3">
          {t.steps.map((step, idx) => {
            const Icon = ICONS[step.id]
            const active = state.phase === step.id
            const complete = isComplete(step.id)
            const progress = progressOf(step.id)
            const sub = subcount(step.id)
            return (
              <li key={step.id} aria-current={active ? 'step' : undefined}>
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors duration-200',
                    complete ? 'border-success/30 text-success' : active ? 'border-accent/40 text-accent' : 'border-line text-quiet/50',
                  )}>
                    {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[11px] font-semibold leading-none', complete || active ? 'text-ink' : 'text-quiet')}>
                      <span className="mr-1.5 font-mono text-quiet">{idx + 1}</span>{step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-none text-quiet">{step.sublabel}</p>
                  </div>
                  {active && <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-accent">{progress > 0 ? `${progress} %` : t.inProgress}</span>}
                  {sub && <span className="shrink-0 font-mono text-[11px] tabular-nums text-success">{sub}</span>}
                </div>
                {active && progress > 0 && (
                  <div className="ml-9 mt-1.5 h-0.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <div className="h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-signal" style={{ transform: `scaleX(${Math.min(progress, 100) / 100})` }} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {isDone && state.summary && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="mb-2.5 font-mono text-[11px] tabular-nums text-quiet">{t.summary(state.summary.totalSaved, state.summary.totalEnriched)}</p>
          <p className="mb-1.5 font-mono text-xs text-quiet">{t.split}</p>
          <dl className="grid grid-cols-4 gap-1">
            {(['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP'] as LeadScoreBadge[]).map((badge) => (
              <div key={badge} className={cn('flex flex-col-reverse rounded-md border py-1.5 text-center', BADGE_TONE[SCORE_BADGE[badge].tone])}>
                <dt className="text-[11px] font-semibold">{SCORE_BADGE[badge].label}</dt>
                <dd className="font-mono text-sm font-bold tabular-nums">{state.summary?.distribution[badge] ?? 0}</dd>
              </div>
            ))}
          </dl>
          {onDismiss && (
            <Button size="sm" onClick={onDismiss} className="mt-3 w-full text-[11px]">
              {t.seeLeads} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
