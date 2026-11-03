/**
 * What a lead's score means, in one place, for the server and the screens.
 *
 *   >= 80   FAST_TRACK  sent first
 *   50-79   NORMAL      sent with the standard sequence
 *   25-49   NURTURE     kept for later
 *   < 25    SKIP        not contacted
 *   none    UNSCORED    scoring failed or not run: never sent automatically
 *
 * "Qualifié" is NOT a score: it is the status a lead gets when it replies
 * positively (hot leads). The score says who to contact, the status who
 * answered.
 */

import type { LeadScoreBadge } from '@prisma/client'

export const BADGE_THRESHOLDS = { FAST_TRACK: 80, NORMAL: 50, NURTURE: 25 } as const

export function scoreToBadge(score: number): LeadScoreBadge {
  if (score >= BADGE_THRESHOLDS.FAST_TRACK) return 'FAST_TRACK'
  if (score >= BADGE_THRESHOLDS.NORMAL) return 'NORMAL'
  if (score >= BADGE_THRESHOLDS.NURTURE) return 'NURTURE'
  return 'SKIP'
}

/**
 * The leads a campaign sends to on its own (launch, wizard, assignment,
 * background search). One rule everywhere: it used to be "not SKIP" in two
 * places and FAST_TRACK + NORMAL in two others, so a NURTURE or an
 * unscored lead was emailed from the wizard but not on assignment.
 */
export const SENDABLE_BADGES: readonly LeadScoreBadge[] = ['FAST_TRACK', 'NORMAL']

export function isSendable(badge: LeadScoreBadge | null | undefined): boolean {
  return !!badge && SENDABLE_BADGES.includes(badge)
}
