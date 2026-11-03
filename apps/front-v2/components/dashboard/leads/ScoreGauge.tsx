import { BADGE_THRESHOLDS } from '@/lib/leads/badges'
import { cn } from '@/lib/utils'

// The ring takes the tone of the lead's priority (lib/leads/badges), the same
// as its LeadScoreBadge: one threshold set, never a second one. Static: it is
// drawn once per scored lead, no per-row animation.
function tone(score: number): { stroke: string; text: string } {
  if (score >= BADGE_THRESHOLDS.FAST_TRACK) return { stroke: 'stroke-success', text: 'text-success' }
  if (score >= BADGE_THRESHOLDS.NORMAL) return { stroke: 'stroke-accent', text: 'text-accent' }
  if (score >= BADGE_THRESHOLDS.NURTURE) return { stroke: 'stroke-warning', text: 'text-warning' }
  return { stroke: 'stroke-danger', text: 'text-danger' }
}

export function ScoreGauge({ score, size = 32 }: { score: number; size?: number }) {
  const t = tone(score)
  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (score / 100) * circumference

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={3} className="stroke-surface" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={t.stroke}
        />
      </svg>
      <span className={cn('absolute font-mono text-[11px] font-semibold tabular-nums', t.text)}>{score}</span>
    </div>
  )
}
