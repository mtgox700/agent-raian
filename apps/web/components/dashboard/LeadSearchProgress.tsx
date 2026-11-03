'use client'

import { m } from 'framer-motion'
import { AlertTriangle, ArrowRight, Check, CheckCircle, Gauge, Loader2, MailCheck, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PipelineEvent, LeadScoreBadge, PipelineSummary } from '@/lib/types/lead'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'search' | 'enrich' | 'score' | 'done' | 'error'

interface ProgressState {
  phase: Phase
  // Agent 1
  searchFound: number
  searchTotal: number
  // Agent 2
  enriched: number
  enrichTotal: number
  // Agent 3
  scored: number
  scoreTotal: number
  // Terminal
  summary: PipelineSummary | null
  error: string | null
}

// ─── Hook: consume SSE pipeline stream ───────────────────────────────────────

export function usePipelineStream() {
  const consume = async (
    params: Record<string, unknown>,
    onEvent: (event: PipelineEvent) => void,
    signal?: AbortSignal
  ) => {
    const res = await fetch('/api/leads/search/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    })

    if (!res.ok || !res.body) {
      const err = await res.text()
      throw new Error(err || 'La prospection n’a pas démarré. Réessayez.')
    }

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
          const event = JSON.parse(line.slice(6)) as PipelineEvent
          onEvent(event)
        } catch {
          // skip malformed events
        }
      }
    }
  }

  return { consume }
}

// ─── The steps ────────────────────────────────────────────────────────────────
// Each step says what it does (app/api/leads/search/stream/route.ts), never
// which provider runs it. Only the three phases the route actually streams are
// shown; every lead stays "Nouveau" until a campaign sends to it.

interface PipelineStep {
  id: Phase
  label: string
  sublabel: string
  icon: React.ElementType
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'search',   label: 'Recherche des comptes', sublabel: 'Contacts qui correspondent à votre ciblage', icon: Search },
  { id: 'enrich',   label: 'Recherche des e-mails', sublabel: 'Adresse trouvée puis vérifiée',               icon: MailCheck },
  { id: 'score',    label: 'Score de priorité',     sublabel: 'Note de 0 à 100 selon votre cible',           icon: Gauge },
]

const PHASE_ORDER: Phase[] = ['search', 'enrich', 'score']

// Same tones as LeadScoreBadge and the campaign screen.
const BADGE_TONE: Record<LeadScoreBadge, string> = {
  FAST_TRACK: 'text-success-fg border-success-fg/25',
  NORMAL:     'text-cyan border-cyan/25',
  NURTURE:    'text-warning border-warning/25',
  SKIP:       'text-danger border-danger/25',
  UNSCORED:   'text-muted border-border',
}

const BADGE_LABELS: Record<LeadScoreBadge, string> = {
  FAST_TRACK: 'Fast Track',
  NORMAL: 'Normal',
  NURTURE: 'Nurture',
  SKIP: 'Écarté',
  UNSCORED: 'Non scoré',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LeadSearchProgressProps {
  state: ProgressState
  onDismiss?: () => void
}

export function LeadSearchProgress({ state, onDismiss }: LeadSearchProgressProps) {
  if (state.phase === 'idle') return null

  const isDone = state.phase === 'done'
  const isError = state.phase === 'error'

  const getPhaseProgress = (phaseId: Phase): number => {
    switch (phaseId) {
      case 'search':
        return state.searchTotal > 0
          ? Math.round((state.searchFound / state.searchTotal) * 100)
          : 0
      case 'enrich':
        return state.enrichTotal > 0
          ? Math.round((state.enriched / state.enrichTotal) * 100)
          : 0
      case 'score':
        return state.scoreTotal > 0
          ? Math.round((state.scored / state.scoreTotal) * 100)
          : 0
      default:
        return 0
    }
  }

  const isPhaseActive = (phaseId: Phase): boolean => state.phase === phaseId
  const isPhaseComplete = (phaseId: Phase): boolean => {
    const phaseIdx = PHASE_ORDER.indexOf(phaseId)
    const currentIdx = PHASE_ORDER.indexOf(state.phase as Phase)
    return isDone || (phaseIdx >= 0 && currentIdx > phaseIdx)
  }

  const getPhaseSubcount = (phaseId: Phase): string | null => {
    if (!isPhaseComplete(phaseId)) return null
    switch (phaseId) {
      case 'search':   return `${state.searchFound} trouvés`
      case 'enrich':   return `${state.enriched} e-mails`
      case 'score':    return `${state.scored} scorés`
      default:         return null
    }
  }

  const title = isDone ? 'Prospection terminée' : isError ? 'La prospection a échoué' : 'Prospection en cours'

  return (
    <m.section
      aria-label="Progression de la prospection"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0.7, 0.1, 1] }}
      className="fixed bottom-6 right-6 z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[10px] border border-border bg-obsidian"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        {isDone ? (
          <CheckCircle className="h-4 w-4 flex-shrink-0 text-success-fg" aria-hidden="true" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-danger" aria-hidden="true" />
        ) : (
          <Loader2 className="h-4 w-4 flex-shrink-0 text-cyan motion-safe:animate-spin" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-none text-white" role="status">{title}</p>
          {!isDone && !isError && (
            <p className="mt-1 font-mono text-[11px] text-muted">{PIPELINE_STEPS.length} étapes, dans l&apos;ordre</p>
          )}
        </div>
        {(isDone || isError) && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fermer la progression"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="px-4 py-3">
          <p className="text-xs leading-relaxed text-danger" role="alert">{state.error}</p>
        </div>
      )}

      {/* Steps */}
      {!isError && (
        <ol className="space-y-2.5 px-4 py-3">
          {PIPELINE_STEPS.map((step, idx) => {
            const StepIcon = step.icon
            const active = isPhaseActive(step.id)
            const complete = isPhaseComplete(step.id)
            const progress = getPhaseProgress(step.id)
            const subcount = getPhaseSubcount(step.id)

            return (
              <li key={step.id} aria-current={active ? 'step' : undefined}>
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${
                      complete ? 'border-success-fg/30 text-success-fg' : active ? 'border-cyan/40 text-cyan' : 'border-border text-muted/50'
                    }`}
                  >
                    {complete
                      ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      : <StepIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-semibold leading-none ${complete || active ? 'text-white' : 'text-muted'}`}>
                      <span className="mr-1.5 font-mono text-muted">{idx + 1}</span>
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-none text-muted">{step.sublabel}</p>
                  </div>

                  {active && (
                    <span className="flex-shrink-0 font-mono text-[11px] font-semibold tabular-nums text-cyan">
                      {progress > 0 ? `${progress} %` : 'en cours'}
                    </span>
                  )}
                  {subcount && (
                    <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-success-fg">
                      {subcount}
                    </span>
                  )}
                </div>

                {/* Progress bar: a transform, never a width */}
                {active && progress > 0 && (
                  <div className="ml-9 mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                    <div
                      className="h-full origin-left rounded-full bg-cyan transition-transform duration-200 ease-signal"
                      style={{ transform: `scaleX(${Math.min(progress, 100) / 100})` }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {/* Done summary */}
      {isDone && state.summary && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="mb-2.5 font-mono text-[11px] tabular-nums text-muted">
            {state.summary.totalSaved} leads enregistrés · {state.summary.totalEnriched} adresses contrôlées
          </p>

          <p className="mb-1.5 font-mono text-xs text-muted">Répartition des priorités</p>
          <dl className="grid grid-cols-4 gap-1">
            {(['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP'] as LeadScoreBadge[]).map((badge) => (
              <div key={badge} className={`flex flex-col-reverse rounded-md border py-1.5 text-center ${BADGE_TONE[badge]}`}>
                <dt className="text-[11px] font-semibold">{BADGE_LABELS[badge]}</dt>
                <dd className="font-mono text-sm font-bold tabular-nums">
                  {state.summary!.distribution[badge] ?? 0}
                </dd>
              </div>
            ))}
          </dl>

          {onDismiss && (
            <Button size="sm" onClick={onDismiss} className="mt-3 w-full gap-1.5 text-[11px]">
              Voir les leads <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </m.section>
  )
}

// Export state type for parent use
export type { ProgressState }
