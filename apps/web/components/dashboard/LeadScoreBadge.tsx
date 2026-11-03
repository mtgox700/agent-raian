'use client'

import { Zap, CheckCircle, Clock, XCircle, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeadScoreBadge as Badge } from '@/lib/types/lead'

// ─── Badge config ─────────────────────────────────────────────────────────────

// Same tones as the campaign screen (CampaignDetailClient SCORE_BADGE):
// success, signal, warning, danger, neutral. Palette tokens only.
const BADGE_CONFIG: Record<Badge, {
  label: string
  icon: React.ElementType
  /** Text, background and border classes of the tone. */
  tone: string
}> = {
  FAST_TRACK: { label: 'Fast Track', icon: Zap,         tone: 'text-success-fg bg-success-fg/10 border-success-fg/25' },
  NORMAL:     { label: 'Normal',     icon: CheckCircle, tone: 'text-cyan bg-cyan/10 border-cyan/25' },
  NURTURE:    { label: 'Nurture',    icon: Clock,       tone: 'text-warning bg-warning/10 border-warning/25' },
  SKIP:       { label: 'Écarté',     icon: XCircle,     tone: 'text-danger bg-danger/10 border-danger/25' },
  UNSCORED:   { label: 'Non scoré',  icon: HelpCircle,  tone: 'text-muted bg-white/[0.03] border-border' },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LeadScoreBadgeProps {
  badge: Badge
  score?: number | null
  size?: 'sm' | 'md'
  showScore?: boolean
  className?: string
}

export function LeadScoreBadge({
  badge,
  score,
  size = 'sm',
  showScore = false,
  className,
}: LeadScoreBadgeProps) {
  const config = BADGE_CONFIG[badge]
  const Icon = config.icon

  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const px = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold',
        config.tone,
        px,
        textSize,
        className
      )}
      title={score != null ? `Score : ${score}/100` : undefined}
    >
      <Icon className={cn(iconSize, 'flex-shrink-0')} aria-hidden="true" />
      {config.label}
      {showScore && score != null && (
        <span className="font-mono tabular-nums opacity-70">· {score}</span>
      )}
    </span>
  )
}
