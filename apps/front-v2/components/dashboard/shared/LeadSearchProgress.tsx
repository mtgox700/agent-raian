'use client'

/**
 * The AI prospecting run (leads.searchStream, SSE), shared by the Leads screen
 * and the campaign page: the stream reader and the floating progress card.
 * Each step says what it does, never which provider runs it.
 */
import { AlertTriangle, ArrowRight, Check, CheckCircle, Gauge, Loader2, MailCheck, Search, X } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { SCORE_BADGE, leadsCopy, progressCopy as t } from '@/lib/copy/leads'
import type { LeadScoreBadge, LeadSearchParams, PipelineEvent, PipelineSummary } from '@/lib/front/types-leads'

export type Phase = 'idle' | 'search' | 'enrich' | 'score' | 'done' | 'error'

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

/**
 * Runs the sourcing pipeline (leads.searchStream) and hands each SSE event
 * (`data: <json>`) to `onEvent` until the stream ends.
 */
export async function consumePipeline(params: LeadSearchParams, onEvent: (event: PipelineEvent) => void, signal?: AbortSignal) {
  let res: Response
  try {
    res = await api.call('leads.searchStream', { body: params }, { signal })
  } catch (err) {
    if (err instanceof ApiError) throw new Error(err.body?.error ?? leadsCopy.pipelineStartFailed)
    throw err
  }
  if (!res.body) throw new Error(leadsCopy.pipelineStartFailed)

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
      try {
        onEvent(JSON.parse(line.slice(6)) as PipelineEvent)
      } catch {
        // skip malformed events
      }
    }
  }
}

const STEP_ICON = { search: Search, enrich: MailCheck, score: Gauge } as const
const PHASE_ORDER: Phase[] = ['search', 'enrich', 'score']
const DISTRIBUTION: LeadScoreBadge[] = ['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP']
const TONE_TEXT: Record<string, string> = {
  success: 'text-success border-success/40', accent: 'text-accent border-accent/40',
  warning: 'text-warning border-warning/40', danger: 'text-danger border-danger/40', neutral: 'text-quiet border-line',
}

/** The run's progress, bottom right: the three steps the route streams, then the priority split. */
export function LeadSearchProgress({ state, onDismiss }: { state: ProgressState; onDismiss?: () => void }) {
  if (state.phase === 'idle') return null

  const isDone = state.phase === 'done'
  const isError = state.phase === 'error'

  const progressOf = (phase: Phase): number => {
    const [n, total] = phase === 'search' ? [state.searchFound, state.searchTotal]
      : phase === 'enrich' ? [state.enriched, state.enrichTotal]
      : phase === 'score' ? [state.scored, state.scoreTotal] : [0, 0]
    return total > 0 ? Math.round((n / total) * 100) : 0
  }
  const isComplete = (phase: Phase): boolean => {
    const idx = PHASE_ORDER.indexOf(phase)
    const current = PHASE_ORDER.indexOf(state.phase)
    return isDone || (idx >= 0 && current > idx)
  }
  const subcount = (phase: Phase): string | null => {
    if (!isComplete(phase)) return null
    if (phase === 'search') return t.found(state.searchFound)
    if (phase === 'enrich') return t.emails(state.enriched)
    if (phase === 'score') return t.scored(state.scored)
    return null
  }

  const title = isDone ? t.done : isError ? t.failed : t.running

  return (
    <section
      aria-label={t.label}
      className="fixed bottom-4 right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-raised md:bottom-6 md:right-6"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        {isDone ? <CheckCircle className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          : isError ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          : <Loader2 className="h-4 w-4 shrink-0 text-accent motion-safe:animate-spin" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-none text-ink" role="status">{title}</p>
          {!isDone && !isError && <p className="mt-1 font-mono text-[11px] text-quiet">{t.stepsInOrder(t.steps.length)}</p>}
        </div>
        {(isDone || isError) && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t.close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isError && <p className="px-4 py-3 text-sm leading-relaxed text-danger" role="alert">{state.error}</p>}

      {!isError && (
        <ol className="space-y-2.5 px-4 py-3">
          {t.steps.map((step, idx) => {
            const Icon = STEP_ICON[step.id]
            const active = state.phase === step.id
            const complete = isComplete(step.id)
            const progress = progressOf(step.id)
            const count = subcount(step.id)
            return (
              <li key={step.id} aria-current={active ? 'step' : undefined}>
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ease-signal',
                      complete ? 'border-success/40 text-success' : active ? 'border-accent/50 text-accent' : 'border-line text-quiet/60',
                    )}
                  >
                    {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs font-medium leading-none', complete || active ? 'text-ink' : 'text-quiet')}>
                      <span className="mr-1.5 font-mono text-quiet">{idx + 1}</span>
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-none text-quiet">{step.sublabel}</p>
                  </div>
                  {active && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-accent">{progress > 0 ? t.percent(progress) : t.inProgress}</span>
                  )}
                  {count && <span className="shrink-0 font-mono text-[11px] tabular-nums text-success">{count}</span>}
                </div>
                {/* A transform, never a width. */}
                {active && progress > 0 && (
                  <div className="ml-9 mt-1.5 h-0.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <div
                      className="h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-signal"
                      style={{ transform: `scaleX(${Math.min(progress, 100) / 100})` }}
                    />
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
          <p className="mb-1.5 font-mono text-xs text-quiet">{t.distribution}</p>
          <dl className="grid grid-cols-4 gap-1">
            {DISTRIBUTION.map((badge) => {
              const cfg = SCORE_BADGE[badge]!
              return (
                <div key={badge} className={cn('flex flex-col-reverse rounded-md border py-1.5 text-center', TONE_TEXT[cfg.tone])}>
                  <dt className="text-[11px]">{cfg.label}</dt>
                  <dd className="font-mono text-sm font-semibold tabular-nums">{state.summary!.distribution[badge] ?? 0}</dd>
                </div>
              )
            })}
          </dl>
          {onDismiss && (
            <Button size="sm" onClick={onDismiss} className="mt-3 w-full">
              {t.seeLeads} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
