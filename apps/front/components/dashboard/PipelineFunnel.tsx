'use client'

import { formatPercent } from '@/lib/format/percent'
import type { PipelineStage } from '@/lib/types/dashboard'

interface PipelineFunnelProps {
  stages: PipelineStage[]
}

/** Tones by stage: machine work in cyan, a human qualification in gold. */
const TONE: Record<string, { bar: string; text: string }> = {
  new:       { bar: 'bg-cyan/15 border-cyan',             text: 'text-cyan' },
  contacted: { bar: 'bg-cyan/15 border-cyan',             text: 'text-cyan' },
  qualified: { bar: 'bg-gold/15 border-gold',             text: 'text-gold' },
  converted: { bar: 'bg-success-fg/15 border-success-fg', text: 'text-success-fg' },
}
const NEUTRAL = { bar: 'bg-muted/10 border-muted', text: 'text-muted' }

export function PipelineFunnel({ stages }: PipelineFunnelProps) {
  // Stages are the current status of each lead: they add up to the total and
  // are not a cumulative funnel, so shares are taken of the total.
  const total = stages.reduce((sum, st) => sum + st.count, 0)
  const maxCount = Math.max(1, ...stages.map((st) => st.count))
  const converted = stages.find((st) => st.id === 'converted')?.count ?? 0

  return (
    <div className="rounded-[10px] border border-border bg-obsidian p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-xs font-medium text-white">
          Entonnoir des leads
        </span>
        <span className="font-mono text-xs tabular-nums text-muted">
          {total.toLocaleString('fr-FR')} leads
        </span>
      </div>

      <div className="space-y-2.5">
        {stages.map((stage) => {
          const widthPct = (stage.count / maxCount) * 100
          const tone = TONE[stage.id] ?? NEUTRAL
          return (
            <div key={stage.id} className="group">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted transition-colors duration-150 ease-signal group-hover:text-white">
                  {stage.label}
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-white">
                  {stage.count.toLocaleString('fr-FR')}
                </span>
              </div>

              <div className="relative h-7 overflow-hidden rounded-md bg-surface">
                {/* Bar: its length is the stage's weight, drawn once on mount (globals.css .ui-grow-x). */}
                <div
                  className={`ui-grow-x absolute inset-y-0 left-0 rounded-md border-r-2 ${tone.bar}`}
                  style={{ width: `${widthPct}%` }}
                />

                {/* Share of all leads */}
                {total > 0 && (
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] font-semibold tabular-nums ${tone.text}`}>
                    {Math.round(stage.percentage)}{'\u00a0'}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Conversion summary */}
      <div className="mt-4 flex items-center justify-between rounded-md border border-border px-3 py-2">
        <span className="font-mono text-xs text-muted">Leads convertis</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-success-fg">
          {total > 0 ? formatPercent((converted / total) * 100) : '-'}
        </span>
      </div>
    </div>
  )
}
