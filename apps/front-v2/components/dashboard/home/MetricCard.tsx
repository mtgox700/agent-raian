import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { home } from '@/lib/app-copy'
import { formatPercent } from '@/lib/format/percent'
import type { DashboardMetric } from '@/lib/front/types'
import { cn } from '@/lib/utils'

// A literal U+00A0 is refused by the linter; built once instead.
const NBSP = String.fromCharCode(160)

/** French figures: decimal comma, thin unit ("1,3 k", not "1.3k"). Body n°1's rule. */
function formatValue(value: number, unit?: string, prefix?: string): string {
  const formatted =
    value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace('.', ',')}${NBSP}M`
    : value >= 10_000 ? `${(value / 1_000).toFixed(1).replace('.', ',')}${NBSP}k`
    : value.toLocaleString('fr-FR')
  return `${prefix ?? ''}${formatted}${unit ?? ''}`
}

function Trend({ metric }: { metric: DashboardMetric }) {
  if (metric.previousValue === null || metric.value === null) return null
  // A rate moves in points, a count in percent of the previous period.
  const delta = metric.unit === '%'
    ? metric.value - metric.previousValue
    : ((metric.value - metric.previousValue) / metric.previousValue) * 100
  const suffix = metric.unit === '%' ? ' pt' : ' %'
  const Icon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus
  const tone = metric.trend === 'up' ? 'text-success' : metric.trend === 'down' ? 'text-danger' : 'text-quiet'
  return (
    <span title={home.metric.trendTitle} className={cn('inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] tabular-nums', tone)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(delta).toFixed(1).replace('.', ',')}{suffix}
    </span>
  )
}

/** Instrument card: a 1px tick in the metric's colour, a mono label, the figure. No glow, no count-up. */
export function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <div className="relative rounded-lg border border-line bg-raised p-5">
      <span className="absolute left-5 top-0 h-px w-8" style={{ background: metric.color }} aria-hidden="true" />
      <p className="mb-3 font-mono text-xs text-quiet">{metric.label}</p>
      {metric.value === null ? (
        <p className="flex h-8 items-end text-sm text-quiet">{home.metric.noData}</p>
      ) : (
        <p className="font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
          {metric.unit === '%' ? formatPercent(metric.value) : formatValue(metric.value, metric.unit, metric.prefix)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Trend metric={metric} />
        {metric.caption && <span className="text-xs text-quiet">{metric.caption}</span>}
      </div>
    </div>
  )
}
