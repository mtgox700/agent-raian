'use client'

/**
 * Who to target (segments, level × industry), do recent weeks catch up
 * (cohort triangle), how far and how fast leads go (pipeline), and what
 * happened to the campaigns (launches and pauses under the trend).
 */

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { describeWeek, STATUS_HISTORY_SINCE } from '@/lib/analytics/annotations'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { AnnotatedWeek, PipelineStage, SegmentBreakdown, SegmentMatrix, SegmentPoint, Triangle } from '@/lib/front/types-analytics'
import { cn } from '@/lib/utils'
import { ci, nf, pct, VERDICT_TONE, weekLabel } from './format'
import { IntervalBar } from './IntervalBar'

const days = (d: number) => `${d.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`

function SegmentVerdict({ s }: { s: SegmentPoint }) {
  const t = analyticsCopy.segments
  if (s.pooled) return <span className="text-[11px] text-quiet">{t.pooled}</span>
  // "insuffisant" is also the engine's "no gap shown": the sample size tells which.
  if (s.rate.n < 30) return <span className="text-[11px] text-quiet">{analyticsCopy.common.under30}</span>
  if (!s.direction || s.verdict === 'insuffisant') return <span className="text-[11px] text-quiet">{t.noGap}</span>
  const proven = s.verdict === 'significatif'
  const tone = proven ? (s.direction === 'au-dessus' ? VERDICT_TONE.good : VERDICT_TONE.bad) : VERDICT_TONE.watch
  return <span className={cn('rounded-full border px-2 py-0.5 font-mono text-[11px]', tone)}>{s.direction}{proven ? '' : t.watchSuffix}</span>
}

export function SegmentsPanel({ breakdowns, singleCampaign }: { breakdowns: SegmentBreakdown[]; singleCampaign: boolean }) {
  const t = analyticsCopy.segments
  const usable = breakdowns.filter((b) => b.comparable)
  const [active, setActive] = useState(usable[0]?.dimension)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const baseId = useId()
  const b = usable.find((x) => x.dimension === active) ?? usable[0]
  if (!b) return null
  // Tabs pattern (WAI-ARIA): arrows move between tabs, Home and End jump.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
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
  const overall = b.segments.reduce((a, s) => ({ r: a.r + s.rate.successes, n: a.n + s.rate.n }), { r: 0, n: 0 })
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label={t.tabs}>
        {usable.map((d, index) => {
          const on = d.dimension === b.dimension
          return (
            <button
              key={d.dimension}
              ref={(el) => { tabRefs.current[index] = el }}
              id={`${baseId}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(d.dimension)}
              onKeyDown={(e) => onTabKey(e, index)}
              className={cn(
                'min-h-[32px] rounded-md border px-3 font-mono text-[11px] transition-colors duration-200 ease-signal',
                on ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-quiet hover:text-ink',
              )}
            >
              {d.title}
            </button>
          )
        })}
      </div>
      <ol id={panelId} className="space-y-2.5" role="tabpanel" aria-label={b.title} tabIndex={0}>
        {b.segments.map((s) => (
          <li key={s.value} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,11rem)_1fr_auto] sm:items-center sm:gap-3">
            <span className={cn('truncate text-xs font-medium', s.pooled ? 'text-quiet' : 'text-ink')}>{s.label}</span>
            <IntervalBar
              rate={s.rate}
              max={max}
              reference={overall.n > 0 ? overall.r / overall.n : undefined}
              muted={s.pooled}
              label={analyticsCopy.common.pointLabel(s.label, pct(s.rate), ci(s.rate), nf(s.rate.n))}
            />
            <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-quiet sm:justify-end">
              <span className="font-semibold text-ink">{pct(s.rate)}</span>
              <span>{nf(s.rate.successes)}/{nf(s.rate.n)}</span>
              <SegmentVerdict s={s} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-quiet">
        {breakdowns.filter((d) => !d.comparable && d.segments.length === 1).map((d) => t.single(d.title, d.segments[0].label))}
        {b.unknown.n > 0 && t.unknown(nf(b.unknown.n))}
        {singleCampaign ? t.singleCampaign : t.mixedCampaigns}
      </p>
    </div>
  )
}

export function MatrixPanel({ matrix }: { matrix: SegmentMatrix }) {
  const t = analyticsCopy.matrix
  const top = Math.max(0.0001, ...matrix.rows.flatMap((r) => r.cells.filter((c) => c.enough).map((c) => c.rate.rate)))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left"><span className="sr-only">{t.level}</span></th>
            {matrix.columns.map((c) => <th key={c.value} scope="col" className="max-w-[8rem] truncate px-2 py-1 text-left font-mono text-[11px] font-medium text-quiet" title={c.label}>{c.label}</th>)}
            <th scope="col" className="px-2 py-1 text-left font-mono text-[11px] font-medium text-quiet">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.value}>
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium text-ink">{r.label}</th>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={cn('rounded-md px-2 py-2 font-mono tabular-nums', c.enough ? 'text-ink' : 'border border-dashed border-line text-quiet')}
                  style={c.enough ? { background: `rgb(var(--c-cyan) / ${0.08 + 0.5 * (c.rate.rate / top)})` } : undefined}
                  title={c.rate.n ? t.cellTitle(pct(c.rate), nf(c.rate.successes), nf(c.rate.n), ci(c.rate)) : t.noLead}
                >
                  {c.rate.n === 0 ? '' : c.enough ? pct(c.rate) : t.leads(nf(c.rate.n))}
                  {c.enough && <span className="block text-[11px] text-ink/60">{t.leads(nf(c.rate.n))}</span>}
                </td>
              ))}
              <td className="px-2 py-2 font-mono tabular-nums text-ink/85">{r.total.n ? pct(r.total) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-quiet">{t.note}</p>
    </div>
  )
}

export function TrianglePanel({ triangle }: { triangle: Triangle }) {
  const t = analyticsCopy.triangle
  const weeks = [...triangle.weeks].reverse()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="border-b border-line font-mono text-[11px] text-quiet">
            <th scope="col" className="px-2 py-2 text-left font-medium">{analyticsCopy.common.weekOf}</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">{t.contacted}</th>
            {triangle.days.map((d) => <th key={d} scope="col" className="px-2 py-2 text-right font-medium">{t.day(d)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line text-quiet">
            <th scope="row" className="px-2 py-2 text-left font-medium">{t.reference}</th>
            <td className="px-2 py-2 text-right text-[11px]">{t.referenceNote}</td>
            {triangle.reference.map((r, i) => <td key={i} className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-ink/85">{r ? pct(r) : ''}</td>)}
          </tr>
          {weeks.map((w) => (
            <tr key={w.week} className="border-b border-line/60">
              <th scope="row" className="px-2 py-2 text-left font-medium text-ink">{weekLabel(w.week)}</th>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-quiet">{nf(w.contacted)}</td>
              {w.cells.map((c, i) => {
                const ref = triangle.reference[i]
                const above = ref && c.state !== 'pending' && c.rate.n >= 30 && c.rate.ci.low > ref.rate
                const below = ref && c.state !== 'pending' && c.rate.n >= 30 && c.rate.ci.high < ref.rate
                return (
                  <td
                    key={c.day}
                    className={cn('px-2 py-2 text-right font-mono tabular-nums', c.state === 'pending' ? 'text-quiet' : above ? 'text-success' : below ? 'text-danger' : 'text-ink/85')}
                    title={c.state === 'pending' ? t.tooRecent : t.cellTitle(nf(c.rate.successes), nf(c.rate.n), ci(c.rate))}
                  >
                    {c.state === 'pending' ? '·' : <>{pct(c.rate)}{c.state === 'partial' && <span className="text-quiet">*</span>}</>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-quiet">{t.note}</p>
    </div>
  )
}

export function PipelinePanel({ stages }: { stages: PipelineStage[] }) {
  const t = analyticsCopy.pipeline
  const first = stages[0]?.count ?? 0
  return (
    <ol className="space-y-2">
      {stages.map((s) => (
        <li key={s.key} className="grid grid-cols-[minmax(0,9.5rem)_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-ink">{s.label}</p>
            {s.note && <p className="truncate text-[11px] text-quiet" title={s.note}>{s.note}</p>}
          </div>
          <div>
            <div className="relative h-7 overflow-hidden rounded-md bg-surface">
              <div className="h-full rounded-md bg-accent/30" style={{ width: `${first ? Math.max(0.6, (s.count / first) * 100) : 0}%` }} />
              <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[11px] font-semibold tabular-nums text-ink">
                {nf(s.count)}{s.ofContacted ? ` · ${pct(s.ofContacted)}` : ''}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-quiet">
              {s.ofContacted ? analyticsCopy.common.ci(ci(s.ofContacted)) : t.firstSent}
              {s.medianDays !== null ? t.median(days(s.medianDays)) : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function AnnotationList({ weeks, firstWeek }: { weeks: AnnotatedWeek[]; firstWeek: string | null }) {
  const t = analyticsCopy.trend
  const since = new Date(`${STATUS_HISTORY_SINCE}T12:00:00Z`)
  const partial = firstWeek !== null && new Date(`${firstWeek}T12:00:00Z`) < since
  const recent = [...weeks].reverse().slice(0, 6)
  return (
    <div className="mt-3 border-t border-line pt-3">
      {recent.length > 0 ? (
        <ul className="space-y-1.5 text-[11px]">
          {recent.map((w) => (
            <li key={w.week} className="flex gap-2">
              <span className="w-16 shrink-0 font-mono font-semibold tabular-nums text-ink">{weekLabel(w.week)}</span>
              <span className="min-w-0 text-ink/80">{describeWeek(w.events)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-quiet">{t.noEvents}</p>
      )}
      {partial && (
        <p className="mt-2 text-[11px] text-quiet">{t.since(since.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      )}
    </div>
  )
}
