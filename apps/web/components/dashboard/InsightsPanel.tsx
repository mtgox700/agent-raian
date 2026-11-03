'use client'

/**
 * Open alerts (lib/insights): what deserves attention now, with the numbers
 * behind it and what to do. On the home page for every campaign the person
 * sees, on a campaign page for that campaign only. Each can be silenced,
 * and offers the actions that answer its cause (components/dashboard/InsightActions).
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BellOff, ChevronDown, Loader2, OctagonAlert, ShieldCheck, Sparkles } from 'lucide-react'
import { ActionConfirm, RecentActions, type OfferedAction, type RecentAction } from './InsightActions'

interface Insight {
  id: string
  kind: string
  severity: 'bloquant' | 'alerte' | 'opportunite'
  title: string
  evidence: string[]
  next: string
  campaignId: string | null
  campaignName: string | null
  openedAt: string
  actions: OfferedAction[]
}

// A good news is not dressed as a problem: its own colour, after the alerts.
const TONE = {
  bloquant:    { Icon: OctagonAlert,  box: 'border-danger/35 bg-danger/[0.05]', icon: 'text-danger',     label: 'Bloquant' },
  alerte:      { Icon: AlertTriangle, box: 'border-gold/30 bg-gold/[0.04]',     icon: 'text-gold',       label: 'Alerte' },
  opportunite: { Icon: Sparkles,      box: 'border-cyan/30 bg-cyan/[0.04]',     icon: 'text-cyan',       label: 'Opportunité' },
} as const

const since = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

function InsightCard({ insight, showCampaign, onSnooze, onActed, busy }: { insight: Insight; showCampaign: boolean; onSnooze: (days: 7 | 30) => void; onActed: () => void; busy: boolean }) {
  const [menu, setMenu] = useState(false)
  const [acting, setActing] = useState<OfferedAction | null>(null)
  const tone = TONE[insight.severity]
  return (
    <li className={`rounded-xl border p-3.5 ${tone.box}`}>
      <div className="flex items-start gap-3">
        <tone.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} aria-label={tone.label} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{insight.title}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {insight.evidence.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <p className="mt-2 text-xs text-white/85"><span className="font-semibold text-white">À faire : </span>{insight.next}</p>
          {insight.campaignId && insight.actions.length > 0 && !acting && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {insight.actions.map((a) => (
                <button key={a.kind} type="button" onClick={() => setActing(a)}
                  className="min-h-[32px] rounded-lg border border-cyan/40 bg-cyan/[0.06] px-3 text-xs font-semibold text-cyan hover:bg-cyan/15">
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
              <Link href={`/dashboard/campaigns/${insight.campaignId}`} className="font-semibold text-cyan hover:underline">Ouvrir la campagne</Link>
            )}
            <span className="text-muted">depuis le {since(insight.openedAt)}</span>
            <div className="relative ml-auto">
              <button type="button" onClick={() => setMenu((v) => !v)} disabled={busy} aria-expanded={menu}
                className="flex min-h-[28px] items-center gap-1 rounded-md px-1.5 text-muted hover:text-white disabled:opacity-50">
                {busy
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Mise en silence en cours</>
                  : <><BellOff className="h-3.5 w-3.5" aria-hidden="true" /> Mettre en silence <ChevronDown className="h-3 w-3" aria-hidden="true" /></>}
              </button>
              {menu && (
                <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-obsidian p-1 shadow-xl">
                  {([7, 30] as const).map((d) => (
                    <button key={d} type="button" onClick={() => { setMenu(false); onSnooze(d) }}
                      className="flex min-h-[32px] w-full items-center rounded-md px-2 text-left text-xs text-white/85 hover:bg-white/[0.05]">
                      Pendant {d} jours
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
  const [state, setState] = useState<{ insights: Insight[]; snoozed: number; recent: RecentAction[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/insights${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ''}`)
      if (!res.ok) {
        // Say which failure it is: an expired session is fixed by reloading, a server error is not.
        setError(res.status === 401
          ? 'Votre session a expiré : rechargez la page pour voir vos alertes.'
          : res.status === 403
          ? 'Vous n’avez pas accès aux alertes de cet espace.'
          : `Les alertes n’ont pas pu être chargées (erreur ${res.status}).`)
        return
      }
      setState(await res.json())
      setError(null)
    } catch {
      setError('Les alertes n’ont pas pu être chargées : la connexion a été interrompue.')
    }
  }, [campaignId])
  useEffect(() => { void load() }, [load])

  const snooze = async (id: string, days: 7 | 30) => {
    setBusy(id)
    const res = await fetch(`/api/insights/${id}/snooze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) }).catch(() => null)
    setBusy(null)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null) as { error?: string } | null
      setError(body?.error ?? 'L’alerte n’a pas pu être mise en silence.')
      return
    }
    setState((s) => (s ? { ...s, insights: s.insights.filter((i) => i.id !== id), snoozed: s.snoozed + 1 } : s))
  }

  if (error && !state) {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" role="status">
        {error}
        <button type="button" onClick={() => { setError(null); void load() }} className="min-h-[28px] text-white underline decoration-muted underline-offset-4 hover:decoration-cyan">
          Réessayer
        </button>
      </p>
    )
  }
  if (!state) return compact ? null : <div className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" aria-hidden="true" />
  // On a campaign page, nothing to say is said by saying nothing.
  if (state.insights.length === 0 && state.recent.length === 0 && (compact || campaignId)) return null

  return (
    <section id="alertes" aria-labelledby="alertes-title" className="scroll-mt-20 rounded-2xl border border-border/60 bg-obsidian p-4 md:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="alertes-title" className="font-display text-base font-bold text-white">
          {state.insights.length > 0 ? `À traiter (${state.insights.length})` : 'À traiter'}
        </h2>
        {state.snoozed > 0 && <span className="text-[11px] text-muted">{state.snoozed} alerte{state.snoozed > 1 ? 's' : ''} en silence</span>}
      </header>
      {error && <p className="mb-2 text-xs text-danger" role="alert">{error}</p>}
      {state.insights.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="h-4 w-4 text-success-fg" aria-hidden="true" /> Aucune alerte : rien ne bloque vos campagnes en ce moment.</p>
      ) : (
        <ul className="space-y-2.5">
          {state.insights.map((i) => <InsightCard key={i.id} insight={i} showCampaign={!campaignId} busy={busy === i.id} onSnooze={(d) => void snooze(i.id, d)} onActed={() => void load()} />)}
        </ul>
      )}
      <RecentActions actions={state.recent} showCampaign={!campaignId} onChanged={() => void load()} />
    </section>
  )
}
