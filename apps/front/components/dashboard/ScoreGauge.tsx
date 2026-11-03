// Server-renderable, no framer: this gauge is rendered once per scored lead
// (hundreds of times on the leads table). A per-instance framer draw-in
// animation meant hundreds of motion components hydrating: a major main-thread
// cost. The ring now renders at its final value statically (identical end state).
import { BADGE_THRESHOLDS } from '@/lib/leads/badges'

interface ScoreGaugeProps {
  score: number
  size?: number
}

// The ring takes the colour of the lead's priority (lib/leads/badges), the
// same tone as its LeadScoreBadge: one threshold set, never a second one.
function getScoreColor(score: number): string {
  if (score >= BADGE_THRESHOLDS.FAST_TRACK) return 'var(--success-fg)'
  if (score >= BADGE_THRESHOLDS.NORMAL) return 'var(--brand-primary)'
  if (score >= BADGE_THRESHOLDS.NURTURE) return 'rgb(var(--c-warning))'
  return 'rgb(var(--c-danger))'
}

export function ScoreGauge({ score, size = 32 }: ScoreGaugeProps) {
  const color = getScoreColor(score)
  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (score / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(var(--fg-rgb),0.05)"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span
        className="absolute font-mono text-[11px] font-bold tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  )
}
