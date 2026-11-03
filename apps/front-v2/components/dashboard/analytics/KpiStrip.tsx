/**
 * The headline figures: each rate with its interval and the number of leads
 * it rests on, and a change shown only when a test supports it.
 */

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { MIN_SAMPLE } from '@/lib/analyst/facts/compare'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { Kpi } from '@/lib/front/types-analytics'
import { cn } from '@/lib/utils'
import { ci, nf, pct, signedPoints } from './format'

const t = analyticsCopy.kpi

/** For bounces, going down is good. */
const LOWER_IS_BETTER = new Set(['bounce'])

function TrendBadge({ kpi, days }: { kpi: Kpi; days: number }) {
  const tr = kpi.trend
  if (!tr) return null
  if (tr.verdict === 'insuffisant') {
    const why = (kpi.previous?.n ?? 0) === 0
      ? t.nothingBefore(days)
      : (kpi.previous?.n ?? 0) < MIN_SAMPLE ? t.fewBefore(days)
      : (kpi.rate?.n ?? 0) < MIN_SAMPLE ? t.fewNow
      : t.tooSmall
    return <span className="text-[11px] text-quiet">{why}</span>
  }
  const up = tr.delta > 0
  const good = LOWER_IS_BETTER.has(kpi.key) ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const proven = tr.verdict === 'significatif'
  const tone = proven ? (good ? 'text-success' : 'text-danger') : 'text-warning'
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono text-[11px] tabular-nums', tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t.points(signedPoints(tr.delta), proven ? t.proven : t.watch)}
    </span>
  )
}

export function KpiStrip({ kpis, days }: { kpis: Kpi[]; days: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.key} className="relative rounded-lg border border-line bg-raised p-4 md:p-5">
          <p className="font-mono text-xs text-quiet">{k.label}</p>
          {k.rate ? (
            <>
              <p className="mt-3 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{k.rate.n > 0 ? pct(k.rate) : analyticsCopy.common.nd}</p>
              <p className="mt-2 font-mono text-[11px] tabular-nums text-quiet">
                {k.rate.n > 0 ? t.of(nf(k.rate.successes), nf(k.rate.n), ci(k.rate)) : t.noMeasurable}
              </p>
              <div className="mt-2"><TrendBadge kpi={k} days={days} /></div>
            </>
          ) : (
            <>
              <p className="mt-3 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{nf(k.value ?? 0)}</p>
              <p className="mt-2 font-mono text-[11px] tabular-nums text-quiet">{t.previous(nf(k.previousValue ?? 0), days)}</p>
            </>
          )}
          {k.note && <p className="mt-2 text-[11px] leading-snug text-quiet">{k.note}</p>}
        </div>
      ))}
    </div>
  )
}
