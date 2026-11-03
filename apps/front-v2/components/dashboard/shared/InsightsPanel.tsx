'use client'

/**
 * Open alerts (insights.list): what deserves attention now, with the numbers
 * behind it and what to do. On the home page for every campaign the person
 * sees, on a campaign page for that campaign only (`campaignId`). Each can be
 * silenced and offers the actions that answer its cause (InsightActions).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BellOff, ChevronDown, Loader2, OctagonAlert, ShieldCheck, Sparkles } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Skeleton } from '@/components/ui'
import { ActionConfirm, RecentActions, type OfferedAction } from '@/components/dashboard/shared/InsightActions'
import { insightsCopy as t } from '@/lib/app-copy'
import { api } from '@/lib/front/api'
import type { InsightOpen, InsightsList } from '@/lib/front/types'
import { cn } from '@/lib/utils'

type Severity = 'bloquant' | 'alerte' | 'opportunite'

// A good news is not dressed as a problem: its own colour, after the alerts.
const TONE: Record<Severity, { Icon: typeof AlertTriangle; box: string; icon: string }> = {
  bloquant:    { Icon: OctagonAlert,  box: 'border-danger/35 bg-danger/[0.05]', icon: 'text-danger' },
  alerte:      { Icon: AlertTriangle, box: 'border-signal/30 bg-signal/[0.04]', icon: 'text-signal' },
  opportunite: { Icon: Sparkles,      box: 'border-accent/30 bg-accent/[0.04]', icon: 'text-accent' },
}
const severityOf = (s: string): Severity => (s === 'bloquant' || s === 'opportunite' ? s : 'alerte')

/** `evidence` is free JSON in the contract; body n°1 shows it as a list of lines. */
const evidenceLines = (e: unknown): string[] => (Array.isArray(e) ? e.filter((x): x is string => typeof x === 'string') : [])

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

function InsightCard({ insight, showCampaign, onSnooze, onActed, busy }: {
  insight: InsightOpen; showCampaign: boolean; onSnooze: (days: 7 | 30) => void; onActed: () => void; busy: boolean
}) {
  const [menu, setMenu] = useState(false)
  const [acting, setActing] = useState<OfferedAction | null>(null)
  const severity = severityOf(insight.severity)
  const tone = TONE[severity]
  return (
    <li className={cn('rounded-lg border p-3.5', tone.box)}>
      <div className="flex items-start gap-3">
        <tone.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.icon)} aria-label={t.severity[severity]} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{insight.title}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-quiet">
            {evidenceLines(insight.evidence).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <p className="mt-2 text-xs text-ink/85"><span className="font-semibold text-ink">{t.todo}</span>{insight.next}</p>
          {insight.campaignId && insight.actions.length > 0 && !acting && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {insight.actions.map((a) => (
                <button key={a.kind} type="button" onClick={() => setActing(a)}
                  className="min-h-[32px] rounded-md border border-accent/40 bg-accent/[0.06] px-3 text-xs font-semibold text-accent transition-colors duration-200 ease-signal hover:bg-accent/15">
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {acting && insight.campaignId && (
            <ActionConfirm insightId={insight.id} campaignId={insight.campaignId} action={acting} onCancel={() => setActing(null)} onDone={() => { setActing(null); onActed() }} />
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
            {showCampaign && insight.campaignId && (
              <Link href={`/dashboard/campaigns/${insight.campaignId}`} className="font-semibold text-accent hover:underline">{t.openCampaign}</Link>
            )}
            <span className="text-quiet">{t.since(shortDate(insight.openedAt))}</span>
            <div className="relative ml-auto">
              <button type="button" onClick={() => setMenu((v) => !v)} disabled={busy} aria-expanded={menu}
                className="flex min-h-[28px] items-center gap-1 rounded-md px-1.5 text-quiet hover:text-ink disabled:opacity-50">
                {busy
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t.snoozing}</>
                  : <><BellOff className="h-3.5 w-3.5" aria-hidden="true" /> {t.snooze} <ChevronDown className="h-3 w-3" aria-hidden="true" /></>}
              </button>
              {menu && (
                <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-line bg-raised p-1">
                  {([7, 30] as const).map((d) => (
                    <button key={d} type="button" onClick={() => { setMenu(false); onSnooze(d) }}
                      className="flex min-h-[32px] w-full items-center rounded-md px-2 text-left text-xs text-ink/85 hover:bg-surface">
                      {t.snoozeFor(d)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

export function InsightsPanel({ campaignId, compact = false }: { campaignId?: string; compact?: boolean }) {
  const [state, setState] = useState<InsightsList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setState(await api.call('insights.list', { query: { campaignId } }))
      setError(null)
    } catch (err) {
      // Say which failure it is: an expired session is fixed by reloading, a server error is not.
      if (err instanceof ApiError) setError(err.status === 401 ? t.errors[401] : err.status === 403 ? t.errors[403] : t.errors.other(err.status))
      else setError(t.errors.network)
    }
  }, [campaignId])
  useEffect(() => { void load() }, [load])

  const snooze = async (id: string, days: 7 | 30) => {
    setBusy(id)
    try {
      await api.call('insights.snooze', { params: { id }, body: { days } })
      setState((s) => (s ? { ...s, insights: s.insights.filter((i) => i.id !== id), snoozed: s.snoozed + 1 } : s))
    } catch (err) {
      setError(err instanceof ApiError && err.body?.error ? err.body.error : t.snoozeFailed)
    } finally {
      setBusy(null)
    }
  }

  if (error && !state) {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-quiet" role="status">
        {error}
        <button type="button" onClick={() => { setError(null); void load() }} className="min-h-[28px] text-ink underline decoration-quiet underline-offset-4 hover:decoration-accent">
          {t.retry}
        </button>
      </p>
    )
  }
  if (!state) return compact ? null : <Skeleton className="h-16 rounded-lg" />
  // On a campaign page, nothing to say is said by saying nothing.
  if (state.insights.length === 0 && state.recent.length === 0 && (compact || campaignId)) return null

  return (
    <section id="alertes" aria-labelledby="alertes-title" className="scroll-mt-20 rounded-lg border border-line bg-raised p-4 md:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="alertes-title" className="font-display text-base font-semibold text-ink">{t.title(state.insights.length)}</h2>
        {state.snoozed > 0 && <span className="text-[11px] text-quiet">{t.snoozed(state.snoozed)}</span>}
      </header>
      {error && <p className="mb-2 text-xs text-danger" role="alert">{error}</p>}
      {state.insights.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-quiet"><ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" /> {t.none}</p>
      ) : (
        <ul className="space-y-2.5">
          {state.insights.map((i) => (
            <InsightCard key={i.id} insight={i} showCampaign={!campaignId} busy={busy === i.id} onSnooze={(d) => void snooze(i.id, d)} onActed={() => void load()} />
          ))}
        </ul>
      )}
      <RecentActions actions={state.recent} showCampaign={!campaignId} onChanged={() => void load()} />
    </section>
  )
}
