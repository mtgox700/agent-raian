'use client'

/**
 * ClassificationDonut: how the replies of the last 30 days were classified
 * (positive, meeting request, neutral, negative, not interested).
 *
 * The centre shows how many replies were classified: the share of each class
 * sits in the legend, with its count, so no figure stands without its base.
 */

import dynamic from 'next/dynamic'
import { MessageSquare } from 'lucide-react'
import { formatPercent } from '@/lib/format/percent'
import type { ClassificationBreakdown } from '@/lib/services/dashboard.service'

// SSR-safe recharts
const PieChart          = dynamic(() => import('recharts').then(mod => mod.PieChart),          { ssr: false })
const Pie               = dynamic(() => import('recharts').then(mod => mod.Pie),               { ssr: false })
const Cell              = dynamic(() => import('recharts').then(mod => mod.Cell),              { ssr: false })
const Tooltip           = dynamic(() => import('recharts').then(mod => mod.Tooltip),           { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false })

/**
 * Tones by class: a reply is human, so interest reads in gold; a refusal in
 * danger; the rest stays neutral. Keyed by the label the service sends.
 */
const TONE: Record<string, string> = {
  'Rendez-vous':   'rgb(var(--c-gold))',
  'Positif':       'rgb(var(--c-gold) / 0.55)',
  'Négatif':       'rgb(var(--c-danger))',
  'Neutre':        'rgb(var(--c-muted))',
  'Pas intéressé': 'rgb(var(--c-muted) / 0.45)',
}

const toneOf = (item: ClassificationBreakdown) => TONE[item.label] ?? 'rgb(var(--c-muted) / 0.45)'

const replies = (n: number) => `${n.toLocaleString('fr-FR')} réponse${n > 1 ? 's' : ''}`

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipPayload {
  name:  string
  value: number
  payload: ClassificationBreakdown
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-md border border-border bg-obsidian px-3 py-2">
      <p className="text-xs font-semibold text-white">{p.name}</p>
      <p className="font-mono text-[11px] tabular-nums text-muted">{replies(p.value)}</p>
    </div>
  )
}

// ─── Legend row ───────────────────────────────────────────────────────────────

function LegendRow({ item, total }: { item: ClassificationBreakdown; total: number }) {
  const share = total > 0 ? (item.count / total) * 100 : 0

  return (
    <div className="flex items-center gap-2.5">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: toneOf(item) }} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{item.label}</span>
      <span className="font-mono text-xs font-semibold tabular-nums text-white">{item.count.toLocaleString('fr-FR')}</span>
      <span className="w-14 text-right font-mono text-[11px] tabular-nums text-muted">
        {formatPercent(share, 0)}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ClassificationDonutProps {
  data: ClassificationBreakdown[]
}

export function ClassificationDonut({ data }: ClassificationDonutProps) {
  const total = data.reduce((s, d) => s + d.count, 0)

  // Interest = positive + meeting request, stated as a count over its base.
  const interested = data
    .filter(d => d.label === 'Positif' || d.label === 'Rendez-vous')
    .reduce((s, d) => s + d.count, 0)

  return (
    <div className="flex flex-col rounded-[10px] border border-border bg-obsidian p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
          <span className="font-mono text-xs font-medium text-white">
            Réponses classées
          </span>
        </div>
        <span className="font-mono text-xs text-muted">30 jours</span>
      </div>

      {total === 0 ? (
        /* Empty state */
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-border bg-surface">
            <MessageSquare className="h-5 w-5 text-muted" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-white">En attente de réponses</p>
            <p className="mt-0.5 text-xs text-muted">
              Chaque réponse reçue sera classée ici
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Donut + centre count */}
          <div className="relative h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={data.length > 1 ? 3 : 0}
                  dataKey="count"
                  nameKey="label"
                  isAnimationActive={false}
                  strokeWidth={0}
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={toneOf(entry)} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Centre: how many replies were classified */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-2xl font-bold tabular-nums text-white">
                {total.toLocaleString('fr-FR')}
              </span>
              <span className="font-mono text-xs text-muted">
                {total > 1 ? 'réponses classées' : 'réponse classée'}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-2">
            {data.map((item, i) => (
              <LegendRow key={i} item={item} total={total} />
            ))}
          </div>

          {/* Interest, over its base */}
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="font-mono text-xs text-muted">Positives ou rendez-vous</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-gold">
              {interested.toLocaleString('fr-FR')} sur {total.toLocaleString('fr-FR')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
