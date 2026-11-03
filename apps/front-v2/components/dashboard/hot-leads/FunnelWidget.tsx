import { Panel } from '@/components/ui'
import { cn } from '@/lib/utils'
import { hotLeadsCopy } from '@/lib/copy/hot-leads'
import type { FunnelStep } from '@/lib/front/types-hot-leads'

const t = hotLeadsCopy.funnel
const BAR = { accent: 'bg-accent/60', signal: 'bg-signal/60', neutral: 'bg-quiet/50' } as const
const TEXT = { accent: 'text-accent', signal: 'text-signal', neutral: 'text-ink' } as const

/**
 * The workspace's lead funnel since the start. Reaching and delivering is the
 * machine (accent), a reply and what follows is a person (signal). Static bars:
 * a height per share, no animation.
 */
export function FunnelWidget({ steps }: { steps: FunnelStep[] }) {
  return (
    <Panel title={t.title} meta={t.meta}>
      <ol className="flex items-start gap-2">
        {steps.map((step) => {
          const tone = t.tone[step.label] ?? 'neutral'
          return (
            <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="relative h-20 w-full overflow-hidden rounded-t-md bg-surface" aria-hidden="true">
                <div style={{ height: `${Math.max(step.percentage, 2)}%` }} className={cn('absolute bottom-0 w-full rounded-t-md', BAR[tone])} />
                <div className={cn('absolute bottom-1 w-full text-center font-mono text-[11px] font-semibold tabular-nums', TEXT[tone])}>
                  {step.count.toLocaleString('fr-FR')}
                </div>
              </div>
              {/* Two lines reserved: a label that wraps does not shift its bar. */}
              <div className="min-h-[2.5rem] text-center leading-tight">
                <p className="text-[11px] text-quiet">
                  {step.label}
                  <span className="sr-only"> : {step.count.toLocaleString('fr-FR')}, </span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-quiet">{t.percent(step.percentage)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
