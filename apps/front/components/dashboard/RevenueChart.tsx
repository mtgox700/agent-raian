'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import type { ChartDataPoint } from '@/lib/types/dashboard'

// SSR-safe recharts import
const AreaChart = dynamic(
  () => import('recharts').then((mod) => mod.AreaChart),
  { ssr: false }
)
const Area = dynamic(() => import('recharts').then((mod) => mod.Area), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
)

type Metric = 'leads' | 'emails' | 'replies' | 'conversions'

/** Cyan = sends (the machine), gold = replies (a human), leads in neutral. */
const METRICS: { key: Metric; label: string; color: string; on: string }[] = [
  { key: 'leads', label: 'Leads', color: 'rgb(var(--c-white) / 0.7)', on: 'border-white/40 text-white' },
  { key: 'emails', label: 'E-mails', color: 'rgb(var(--c-cyan))', on: 'border-cyan/50 text-cyan' },
  { key: 'replies', label: 'Réponses', color: 'rgb(var(--c-gold))', on: 'border-gold/50 text-gold' },
]

const AXIS = { fill: 'rgb(var(--c-muted))', fontSize: 10, fontFamily: 'var(--font-mono, monospace)' }

interface RevenueChartProps {
  data: ChartDataPoint[]
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-obsidian px-3 py-2">
      <p className="mb-1.5 font-mono text-[11px] font-medium text-muted">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-xs text-muted">{p.name}{'\u00a0'}:</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-white">{p.value.toLocaleString('fr-FR')}</span>
        </div>
      ))}
    </div>
  )
}

export function RevenueChart({ data }: RevenueChartProps) {
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(['emails', 'replies']))

  const toggleMetric = (key: Metric) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Show only last 14 data points for clarity (the title says so)
  const displayData = data.slice(-14)

  return (
    <div className="rounded-[10px] border border-border bg-obsidian p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs font-medium text-white">
          Activité sur {displayData.length} jours
        </span>
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map(({ key, label, color, on }) => {
            const active = activeMetrics.has(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleMetric(key)}
                aria-pressed={active}
                className={`flex min-h-[28px] items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] font-medium transition-colors duration-150 ease-signal ${active ? on : 'border-border text-muted hover:text-white'}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: active ? color : 'rgb(var(--c-muted) / 0.4)' }}
                  aria-hidden="true"
                />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="date"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              interval={3}
            />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {METRICS.filter(({ key }) => activeMetrics.has(key)).map(({ key, label, color }) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.08}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
