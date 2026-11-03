import type { Rate } from '@/lib/front/types-analytics'
import { cn } from '@/lib/utils'

/**
 * A rate on a common scale: its 95 % interval as a bar, the rate as a point,
 * an optional reference line (the pooled rate). A hollow point marks a
 * small sample. Accent: a figure computed by the machine.
 */
export function IntervalBar({ rate, max, reference, label, hollow = false, muted = false, className }: {
  rate: Rate
  max: number
  reference?: number
  label: string
  hollow?: boolean
  muted?: boolean
  className?: string
}) {
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  return (
    <div className={cn('relative h-6', className)} role="img" aria-label={label}>
      {reference !== undefined && <div className="absolute inset-y-0 w-px bg-ink/25" style={{ left: x(reference) }} aria-hidden="true" />}
      <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent/35" style={{ left: x(rate.ci.low), width: `calc(${x(rate.ci.high)} - ${x(rate.ci.low)})` }} />
      <div
        className={cn(
          'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-raised',
          muted ? 'bg-quiet' : hollow ? 'bg-transparent ring-1 ring-accent' : 'bg-accent',
        )}
        style={{ left: x(rate.rate) }}
      />
    </div>
  )
}
