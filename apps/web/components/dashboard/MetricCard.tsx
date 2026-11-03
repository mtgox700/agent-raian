'use client'

import { formatPercent } from '@/lib/format/percent'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useAnimatedCounter } from '@/lib/hooks/use-animated-counter'
import type { MetricData } from '@/lib/types/dashboard'

interface MetricCardProps {
  metric: MetricData
  index?: number
}

// A literal U+00A0 is refused by the linter; built once instead.
const NBSP = String.fromCharCode(160)

function formatValue(value: number, unit?: string, prefix?: string): string {
  // French figures: decimal comma, thin unit ("1,3 k", not "1.3k").
  const formatted =
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1).replace('.', ',')}${NBSP}M`
      : value >= 10_000
      ? `${(value / 1_000).toFixed(1).replace('.', ',')}${NBSP}k`
      : unit === '%'
      ? value.toFixed(1).replace('.', ',')
      : value.toLocaleString('fr-FR')
  return `${prefix ?? ''}${formatted}${unit ?? ''}`
}

function TrendBadge({ metric }: { metric: MetricData }) {
  if (metric.previousValue === null || metric.value === null) return null
  // A rate moves in points, a count in percent of the previous period.
  const delta = metric.unit === '%'
    ? metric.value - metric.previousValue
    : ((metric.value - metric.previousValue) / metric.previousValue) * 100
  const suffix = metric.unit === '%' ? ' pt' : ' %'

  const Icon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus
  const color =
    metric.trend === 'up' ? 'text-success-fg' : metric.trend === 'down' ? 'text-danger' : 'text-muted'

  return (
    <span title="Comparé aux 30 jours précédents" className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] tabular-nums ${color}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(delta).toFixed(1).replace('.', ',')}{suffix}
    </span>
  )
}

// Instrument card: a hairline, a mono label, the figure. The metric's colour
// marks only a 1px tick, never a glow.
export function MetricCard({ metric, index = 0 }: MetricCardProps) {
  const value = metric.value ?? 0
  const animated = useAnimatedCounter(
    metric.unit === '%' ? Math.round(value * 10) : value,
    { duration: 1200 + index * 80 }
  )

  const displayValue =
    metric.unit === '%'
      ? formatPercent(animated / 10)
      : formatValue(animated, metric.unit, metric.prefix)

  return (
    <div className="relative rounded-[10px] border border-border bg-obsidian p-5">
      <span className="absolute left-5 top-0 h-px w-8" style={{ background: metric.color }} aria-hidden="true" />
      <p className="mb-3 font-mono text-xs text-muted">{metric.label}</p>

      {metric.value === null ? (
        <div className="flex h-8 items-end text-sm text-muted">Pas encore de données</div>
      ) : (
        <div className="font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">
          {displayValue}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <TrendBadge metric={metric} />
        {metric.caption && <span className="text-xs text-muted">{metric.caption}</span>}
      </div>
    </div>
  )
}
