import { Panel } from '@/components/ui'
import { home } from '@/lib/app-copy'
import { formatPercent } from '@/lib/format/percent'
import type { DashboardPipelineStage } from '@/lib/front/types'

/** Tones by stage: machine work in accent, a human qualification in signal. */
const TONE: Record<string, { bar: string; text: string }> = {
  new:       { bar: 'bg-accent/15 border-accent',   text: 'text-accent' },
  contacted: { bar: 'bg-accent/15 border-accent',   text: 'text-accent' },
  qualified: { bar: 'bg-signal/15 border-signal',   text: 'text-signal' },
  converted: { bar: 'bg-success/15 border-success', text: 'text-success' },
}
const NEUTRAL = { bar: 'bg-quiet/10 border-quiet', text: 'text-quiet' }

export function PipelineFunnel({ stages }: { stages: DashboardPipelineStage[] }) {
  // Stages are each lead's current status: they add up to the total, so shares are of the total.
  const total = stages.reduce((sum, s) => sum + s.count, 0)
  const max = Math.max(1, ...stages.map((s) => s.count))
  const converted = stages.find((s) => s.id === 'converted')?.count ?? 0

  return (
    <Panel title={home.funnel.title} meta={<span className="tabular-nums">{home.funnel.total(total)}</span>} className="h-full">
      <ul className="space-y-2.5">
        {stages.map((stage) => {
          const tone = TONE[stage.id] ?? NEUTRAL
          return (
            <li key={stage.id}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-quiet">{stage.label}</span>
                <span className="font-mono text-xs font-semibold tabular-nums text-ink">{stage.count.toLocaleString('fr-FR')}</span>
              </div>
              <div className="relative h-7 overflow-hidden rounded-md bg-surface">
                <div className={`absolute inset-y-0 left-0 rounded-md border-r-2 ${tone.bar}`} style={{ width: `${(stage.count / max) * 100}%` }} />
                {total > 0 && (
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] font-semibold tabular-nums ${tone.text}`}>
                    {Math.round(stage.percentage)}{' '}%
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between rounded-md border border-line px-3 py-2">
        <span className="font-mono text-xs text-quiet">{home.funnel.converted}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-success">
          {total > 0 ? formatPercent((converted / total) * 100) : '-'}
        </span>
      </div>
    </Panel>
  )
}
