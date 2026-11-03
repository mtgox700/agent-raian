import { Badge } from '@/components/ui'
import { SCORE_BADGE } from '@/lib/copy/leads'
import type { LeadScoreBadge as BadgeKey } from '@/lib/front/types-leads'

/** The lead's priority (Fast Track, Normal, Nurture, Écarté, Non scoré) as a Badge tone. */
export function LeadScoreBadge({ badge, className }: { badge: BadgeKey; className?: string }) {
  const config = SCORE_BADGE[badge] ?? SCORE_BADGE.UNSCORED!
  return <Badge tone={config.tone} className={className}>{config.label}</Badge>
}
