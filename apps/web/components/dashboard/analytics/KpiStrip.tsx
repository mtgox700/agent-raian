'use client'

/**
 * The headline figures: each rate with its interval and the number of leads
 * it rests on, and a change shown only when a test supports it.
 */

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { MIN_SAMPLE } from '@/lib/analyst/facts/compare'
import type { Kpi } from '@/lib/analytics/build'
import { ci, nf, pct } from './ChartFrame'

/** For bounces, going down is good. */
const LOWER_IS_BETTER = new Set(['bounce'])

function TrendBadge({ kpi, days }: { kpi: Kpi; days: number }) {
  const t = kpi.trend
  if (!t) return null
  if (t.verdict === 'insuffisant') {
    const why = (kpi.previous?.n ?? 0) === 0
      ? `rien à comparer sur les ${days} jours précédents`
      : (kpi.previous?.n ?? 0) < MIN_SAMPLE ? `trop peu de leads sur les ${days} jours précédents pour comparer`
      : (kpi.rate?.n ?? 0) < MIN_SAMPLE ? 'trop peu de leads sur la période pour comparer'
      : 'écart trop faible pour conclure'
    return <span className="text-[11px] text-muted">{why}</span>
  }
  const up = t.delta > 0
  const good = LOWER_IS_BETTER.has(kpi.key) ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const word = t.verdict === 'significatif' ? 'évolution démontrée' : 'à surveiller, non démontré'
  const tone = t.verdict === 'significatif' ? (good ? 'text-success-fg' : 'text-danger') : 'text-warning'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {(t.delta * 100 > 0 ? '+' : '') + (t.delta * 100).toFixed(1).replace('.', ',')} pt · {word}
    </span>
  )
}

export function KpiStrip({ kpis, days }: { kpis: Kpi[]; days: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.key} className="rounded-[10px] border border-border bg-obsidian p-4">
          <p className="font-mono text-xs text-muted">{k.label}</p>
          {k.rate ? (
            <>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-white">{k.rate.n > 0 ? pct(k.rate) : 'n.d.'}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted">
                {k.rate.n > 0 ? `${nf(k.rate.successes)} sur ${nf(k.rate.n)} · IC 95 % ${ci(k.rate)}` : 'aucun lead mesurable sur la période'}
              </p>
              <div className="mt-2"><TrendBadge kpi={k} days={days} /></div>
            </>
          ) : (
            <>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-white">{nf(k.value ?? 0)}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted">{nf(k.previousValue ?? 0)} sur les {days} jours précédents</p>
            </>
          )}
          {k.note && <p className="mt-2 text-[11px] leading-snug text-muted">{k.note}</p>}
        </div>
      ))}
    </div>
  )
}
