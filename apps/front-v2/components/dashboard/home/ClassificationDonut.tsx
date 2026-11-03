'use client'

import dynamic from 'next/dynamic'
import { MessageSquare } from 'lucide-react'
import { EmptyState, Panel } from '@/components/ui'
import { home } from '@/lib/app-copy'
import { formatPercent } from '@/lib/format/percent'
import type { DashboardClassification } from '@/lib/front/types'

const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false })
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false })
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false })

const t = home.donut

/** A reply is a person: interest in signal, refusal in danger, the rest neutral. Keyed by the API's labels. */
const TONE: Record<string, string> = {
  'Rendez-vous':   'rgb(var(--c-gold))',
  'Positif':       'rgb(var(--c-gold) / 0.55)',
  'Négatif':       'rgb(var(--c-danger))',
  'Neutre':        'rgb(var(--c-muted))',
  'Pas intéressé': 'rgb(var(--c-muted) / 0.45)',
}
const toneOf = (item: DashboardClassification) => TONE[item.label] ?? 'rgb(var(--c-muted) / 0.45)'

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2">
      <p className="text-xs font-semibold text-ink">{payload[0].name}</p>
      <p className="font-mono text-[11px] tabular-nums text-quiet">{t.replies(payload[0].value)}</p>
    </div>
  )
}

/** How the replies of the last 30 days were classified; each share sits with its count. */
export function ClassificationDonut({ data }: { data: DashboardClassification[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const interested = data.filter((d) => d.label === 'Positif' || d.label === 'Rendez-vous').reduce((s, d) => s + d.count, 0)

  return (
    <Panel title={<span className="inline-flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5 text-signal" aria-hidden="true" />{t.title}</span>} meta={t.period} className="flex h-full flex-col">
      {total === 0 ? (
        <EmptyState icon={MessageSquare} title={t.emptyTitle} className="flex-1">{t.emptyBody}</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={68} paddingAngle={data.length > 1 ? 3 : 0}
                  dataKey="count" nameKey="label" isAnimationActive={false} strokeWidth={0}>
                  {data.map((entry) => <Cell key={entry.label} fill={toneOf(entry)} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-2xl font-bold tabular-nums text-ink">{total.toLocaleString('fr-FR')}</span>
              <span className="font-mono text-xs text-quiet">{t.centre(total)}</span>
            </div>
          </div>
          <ul className="space-y-2">
            {data.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: toneOf(item) }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs text-quiet">{item.label}</span>
                <span className="font-mono text-xs font-semibold tabular-nums text-ink">{item.count.toLocaleString('fr-FR')}</span>
                <span className="w-14 text-right font-mono text-[11px] tabular-nums text-quiet">{formatPercent(total > 0 ? (item.count / total) * 100 : 0, 0)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
            <span className="font-mono text-xs text-quiet">{t.interested}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-signal">{t.of(interested, total)}</span>
          </div>
        </div>
      )}
    </Panel>
  )
}
