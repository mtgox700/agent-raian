import { Badge } from '@/components/ui'
import { SCORE_BADGE } from '@/lib/copy/leads'

/** The lead's priority (Fast Track, Normal, Nurture, Écarté, Non scoré) as a Badge tone. */
export function LeadScoreBadge({ badge, className }: { badge: string; className?: string }) {
  const config = SCORE_BADGE[badge] ?? SCORE_BADGE.UNSCORED!
  return <Badge tone={config.tone} className={className}>{config.label}</Badge>
}
