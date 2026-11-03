'use client'

/**
 * Analytics A3: who to target (segments, level × industry), do recent weeks
 * catch up (cohort triangle), how far and how fast leads go (pipeline).
 * Types only from lib/analytics: those modules read the database.
 */

import { useId, useRef, useState } from 'react'
import type { SegmentBreakdown, SegmentMatrix, SegmentPoint } from '@/lib/analytics/segments'
import type { PipelineStage, Triangle } from '@/lib/analytics/pipeline'
import { describeWeek, STATUS_HISTORY_SINCE, type AnnotatedWeek } from '@/lib/analytics/annotations'
import { ci, nf, pct } from './ChartFrame'

const weekLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const days = (d: number) => `${d.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`

function SegmentVerdict({ s }: { s: SegmentPoint }) {
  if (s.pooled) return <span className="text-[11px] text-muted">regroupés, non testés</span>
  // "insuffisant" is also the engine's "no gap shown": the sample size tells which.
  if (s.rate.n < 30) return <span className="text-[11px] text-muted">moins de 30 leads</span>
  if (!s.direction || s.verdict === 'insuffisant') return <span className="text-[11px] text-muted">pas d’écart démontré</span>
  const proven = s.verdict === 'significatif'
  const tone = proven ? (s.direction === 'au-dessus' ? 'border-success-fg/40 text-success-fg' : 'border-danger/40 text-danger') : 'border-warning/40 text-warning'
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{s.direction}{proven ? '' : ', à surveiller'}</span>
}

export function SegmentsPanel({ breakdowns, singleCampaign }: { breakdowns: SegmentBreakdown[]; singleCampaign: boolean }) {
  const usable = breakdowns.filter((b) => b.comparable)
  const [active, setActive] = useState(usable[0]?.dimension)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const baseId = useId()
  const b = usable.find((x) => x.dimension === active) ?? usable[0]
  if (!b) return null
  // Tabs pattern (WAI-ARIA): arrows move between tabs, Home and End jump.
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = usable.length - 1
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    setActive(usable[next].dimension)
    tabRefs.current[next]?.focus()
  }
  const panelId = `${baseId}-panel`
  const max = Math.max(0.05, ...b.segments.map((s) => s.rate.ci.high)) * 1.1
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const overall = b.segments.reduce((a, s) => ({ r: a.r + s.rate.successes, n: a.n + s.rate.n }), { r: 0, n: 0 })
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Dimension">
        {usable.map((d, index) => (
          <button key={d.dimension} ref={(el) => { tabRefs.current[index] = el }} id={`${baseId}-tab-${index}`} type="button" role="tab"
            aria-selected={d.dimension === b.dimension} aria-controls={panelId} tabIndex={d.dimension === b.dimension ? 0 : -1}
            onClick={() => setActive(d.dimension)} onKeyDown={(e) => onTabKey(e, index)}
            className={`min-h-[32px] rounded-md px-3 text-xs font-semibold transition-colors ${d.dimension === b.dimension ? 'bg-cyan/15 text-cyan' : 'border border-border text-muted hover:text-white'}`}>
            {d.title}
          </button>
        ))}
      </div>
      <ol id={panelId} className="space-y-2.5" role="tabpanel" aria-label={b.title} tabIndex={0}>
        {b.segments.map((s) => (
          <li key={s.value} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,11rem)_1fr_auto] sm:items-center sm:gap-3">
            <span className={`truncate text-xs font-semibold ${s.pooled ? 'text-muted' : 'text-white'}`}>{s.label}</span>
            <div className="relative h-6" role="img" aria-label={`${s.label} : ${pct(s.rate)}, intervalle ${ci(s.rate)}, ${nf(s.rate.n)} leads`}>
              {overall.n > 0 && <div className="absolute inset-y-0 w-px bg-white/25" style={{ left: x(overall.r / overall.n) }} aria-hidden="true" />}
              <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-cyan/35" style={{ left: x(s.rate.ci.low), width: `calc(${x(s.rate.ci.high)} - ${x(s.rate.ci.low)})` }} />
              <div className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-void ${s.pooled ? 'bg-muted' : 'bg-cyan'}`} style={{ left: x(s.rate.rate) }} />
            </div>
            <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted sm:justify-end">
              <span className="font-semibold text-white">{pct(s.rate)}</span>
              <span>{nf(s.rate.successes)}/{nf(s.rate.n)}</span>
              <SegmentVerdict s={s} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-muted">
        {breakdowns.filter((d) => !d.comparable && d.segments.length === 1).map((d) => `${d.title} : tous vos leads mesurés sont « ${d.segments[0].label} », rien à comparer. `)}
        {b.unknown.n > 0 && `${nf(b.unknown.n)} leads sans cette information, hors comparaison. `}
        {singleCampaign
          ? 'Une seule campagne : même message, même boîte, même période ; un écart peut être démontré.'
          : 'Plusieurs campagnes mêlées : un écart peut venir du message ou de la période, il reste « à surveiller ». Choisissez une campagne pour le tester.'}
      </p>
    </div>
  )
}

export function MatrixPanel({ matrix }: { matrix: SegmentMatrix }) {
  const top = Math.max(0.0001, ...matrix.rows.flatMap((r) => r.cells.filter((c) => c.enough).map((c) => c.rate.rate)))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-semibold text-muted"><span className="sr-only">Niveau</span></th>
            {matrix.columns.map((c) => <th key={c.value} scope="col" className="max-w-[8rem] truncate px-2 py-1 text-left font-semibold text-muted" title={c.label}>{c.label}</th>)}
            <th scope="col" className="px-2 py-1 text-left font-semibold text-muted">Ensemble</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.value}>
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-semibold text-white">{r.label}</th>
              {r.cells.map((c, i) => (
                <td key={i} className={`rounded-md px-2 py-2 tabular-nums ${c.enough ? 'text-white' : 'border border-dashed border-border text-muted'}`}
                  style={c.enough ? { background: `rgba(var(--brand-primary-rgb), ${0.08 + 0.5 * (c.rate.rate / top)})` } : undefined}
                  title={c.rate.n ? `${pct(c.rate)}, ${nf(c.rate.successes)} sur ${nf(c.rate.n)} leads, IC ${ci(c.rate)}` : 'aucun lead'}>
                  {c.rate.n === 0 ? '' : c.enough ? pct(c.rate) : `${nf(c.rate.n)} leads`}
                  {c.enough && <span className="block text-[11px] text-white/60">{nf(c.rate.n)} leads</span>}
                </td>
              ))}
              <td className="px-2 py-2 tabular-nums text-white/85">{r.total.n ? pct(r.total) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">Une case de moins de 30 leads n’affiche pas de taux : seulement son effectif. Croiser deux critères multiplie les cases, donc le hasard : à lire comme une piste, à vérifier sur une campagne dédiée.</p>
    </div>
  )
}

export function TrianglePanel({ triangle }: { triangle: Triangle }) {
  const weeks = [...triangle.weeks].reverse()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="px-2 py-2 text-left font-semibold">Semaine du</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Contactés</th>
            {triangle.days.map((d) => <th key={d} scope="col" className="px-2 py-2 text-right font-semibold">J+{d}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border text-muted">
            <th scope="row" className="px-2 py-2 text-left font-semibold">Référence</th>
            <td className="px-2 py-2 text-right text-[11px]">semaines complètes</td>
            {triangle.reference.map((r, i) => <td key={i} className="px-2 py-2 text-right tabular-nums font-semibold text-white/85">{r ? pct(r) : ''}</td>)}
          </tr>
          {weeks.map((w) => (
            <tr key={w.week} className="border-b border-border/30">
              <th scope="row" className="px-2 py-2 text-left font-semibold text-white">{weekLabel(w.week)}</th>
              <td className="px-2 py-2 text-right tabular-nums text-muted">{nf(w.contacted)}</td>
              {w.cells.map((c, i) => {
                const ref = triangle.reference[i]
                const above = ref && c.state !== 'pending' && c.rate.n >= 30 && c.rate.ci.low > ref.rate
                const below = ref && c.state !== 'pending' && c.rate.n >= 30 && c.rate.ci.high < ref.rate
                return (
                  <td key={c.day} className={`px-2 py-2 text-right tabular-nums ${c.state === 'pending' ? 'text-muted' : above ? 'text-success-fg' : below ? 'text-danger' : 'text-white/85'}`}
                    title={c.state === 'pending' ? 'trop récent' : `${nf(c.rate.successes)} sur ${nf(c.rate.n)} leads, IC ${ci(c.rate)}`}>
                    {c.state === 'pending' ? '·' : <>{pct(c.rate)}{c.state === 'partial' && <span className="text-muted">*</span>}</>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">Part des leads ayant répondu après 3, 7, 14 et 30 jours. « · » : semaine trop récente. « * » : seuls les leads assez anciens comptent. En vert ou en rouge : intervalle entièrement au-dessus ou en dessous de la référence (30 leads au moins).</p>
    </div>
  )
}

export function PipelinePanel({ stages }: { stages: PipelineStage[] }) {
  const first = stages[0]?.count ?? 0
  return (
    <ol className="space-y-2">
      {stages.map((s) => (
        <li key={s.key} className="grid grid-cols-[minmax(0,9.5rem)_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{s.label}</p>
            {s.note && <p className="truncate text-[11px] text-muted" title={s.note}>{s.note}</p>}
          </div>
          <div>
            <div className="relative h-7 overflow-hidden rounded-md bg-white/[0.03]">
              <div className="h-full rounded-md bg-cyan/30" style={{ width: `${first ? Math.max(0.6, (s.count / first) * 100) : 0}%` }} />
              <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold tabular-nums text-white">
                {nf(s.count)}{s.ofContacted ? ` · ${pct(s.ofContacted)}` : ''}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted">
              {s.ofContacted ? `IC ${ci(s.ofContacted)}` : 'premier message envoyé sur la période'}
              {s.medianDays !== null ? ` · médiane ${days(s.medianDays)} après le premier contact` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function AnnotationList({ weeks, firstWeek }: { weeks: AnnotatedWeek[]; firstWeek: string | null }) {
  const since = new Date(`${STATUS_HISTORY_SINCE}T12:00:00Z`)
  const partial = firstWeek !== null && new Date(`${firstWeek}T12:00:00Z`) < since
  const recent = [...weeks].reverse().slice(0, 6)
  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      {recent.length > 0 ? (
        <ul className="space-y-1.5 text-[11px]">
          {recent.map((w) => (
            <li key={w.week} className="flex gap-2">
              <span className="w-16 shrink-0 font-mono font-semibold tabular-nums text-white">{weekLabel(w.week)}</span>
              <span className="min-w-0 text-white/80">
                {describeWeek(w.events)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted">Aucun lancement ni pause sur ces 12 semaines.</p>
      )}
      {partial && (
        <p className="mt-2 text-[11px] text-muted">
          Lancements et pauses enregistrés depuis le {since.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} : les semaines antérieures n’en montrent pas.
        </p>
      )}
    </div>
  )
}
