'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Panel } from '@/components/ui'
import { home } from '@/lib/app-copy'
import type { DashboardChartPoint } from '@/lib/front/types'
import { cn } from '@/lib/utils'

// Recharts is loaded in the browser only, after the page is painted.
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false })
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false })

type Series = 'leads' | 'emails' | 'replies'

/** Accent = sends (the machine), signal = replies (a person), leads in ink. Theme variables only. */
const SERIES: { key: Series; color: string; on: string }[] = [
  { key: 'leads',   color: 'rgb(var(--c-white) / 0.7)', on: 'border-ink/40 text-ink' },
  { key: 'emails',  color: 'rgb(var(--c-cyan))',        on: 'border-accent/50 text-accent' },
  { key: 'replies', color: 'rgb(var(--c-gold))',        on: 'border-signal/50 text-signal' },
]

const AXIS = { fill: 'rgb(var(--c-muted))', fontSize: 10, fontFamily: 'var(--font-mono, monospace)' }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2">
      <p className="mb-1.5 font-mono text-[11px] font-medium text-quiet">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-xs text-quiet">{p.name}{' '}:</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-ink">{p.value.toLocaleString('fr-FR')}</span>
        </div>
      ))}
    </div>
  )
}

/** Daily leads, sends and replies; the last 14 points (the title says how many). */
export function ActivityChart({ data }: { data: DashboardChartPoint[] }) {
  const [active, setActive] = useState<Set<Series>>(new Set(['emails', 'replies']))
  const toggle = (key: Series) => setActive((prev) => {
    const next = new Set(prev)
    if (next.has(key)) { if (next.size > 1) next.delete(key) } else next.add(key)
    return next
  })
  const shown = data.slice(-14)

  return (
    <Panel
      title={home.chart.title(shown.length)}
      action={
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map(({ key, color, on }) => {
            const isOn = active.has(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                aria-pressed={isOn}
                className={cn('flex min-h-[28px] items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] font-medium transition-colors duration-200 ease-signal', isOn ? on : 'border-line text-quiet hover:text-ink')}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: isOn ? color : 'rgb(var(--c-muted) / 0.4)' }} aria-hidden="true" />
                {home.chart.series[key]}
              </button>
            )
          })}
        </div>
      }
      className="h-full"
    >
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={shown} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            {SERIES.filter(({ key }) => active.has(key)).map(({ key, color }) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={home.chart.series[key]}
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
    </Panel>
  )
}
