/**
 * Phantera: Score calibration feedback (learning loop, part 2).
 *
 * Closes the loop on lead scoring: compare actual conversion by badge against
 * the expected ordering (FAST_TRACK > NORMAL > NURTURE > SKIP). If reality
 * disagrees, the scoring prompt/weights need recalibration. Pure + testable.
 */

import type { LeadScoreBadge } from '@/lib/types/lead'

export interface ScoredLeadOutcome {
  badge: LeadScoreBadge
  converted: boolean // booked a meeting / qualified
}

export interface BadgeConversion {
  badge: LeadScoreBadge
  count: number
  conversions: number
  rate: number // 0-1
}

const EXPECTED_ORDER: LeadScoreBadge[] = ['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP']

export interface CalibrationReport {
  byBadge: BadgeConversion[]
  /** True when conversion rate is monotonically non-increasing along the badge order. */
  monotonic: boolean
  /** Human-readable issues (e.g. a lower badge out-converting a higher one). */
  issues: string[]
}

export function analyzeScoreCalibration(rows: ScoredLeadOutcome[]): CalibrationReport {
  const counts = new Map<LeadScoreBadge, { count: number; conversions: number }>()
  for (const b of EXPECTED_ORDER) counts.set(b, { count: 0, conversions: 0 })
  for (const r of rows) {
    const e = counts.get(r.badge)
    if (!e) continue
    e.count += 1
    if (r.converted) e.conversions += 1
  }

  const byBadge: BadgeConversion[] = EXPECTED_ORDER.map((badge) => {
    const e = counts.get(badge)!
    return { badge, count: e.count, conversions: e.conversions, rate: e.count ? e.conversions / e.count : 0 }
  })

  // Check monotonic non-increasing rate, only across badges with samples.
  const sampled = byBadge.filter((b) => b.count > 0)
  const issues: string[] = []
  let monotonic = true
  for (let i = 1; i < sampled.length; i++) {
    if (sampled[i].rate > sampled[i - 1].rate + 1e-9) {
      monotonic = false
      issues.push(
        `${sampled[i].badge} (${(sampled[i].rate * 100).toFixed(0)}%) convertit mieux que ` +
        `${sampled[i - 1].badge} (${(sampled[i - 1].rate * 100).toFixed(0)}%) : recalibrer le scoring.`,
      )
    }
  }

  return { byBadge, monotonic, issues }
}
