/**
 * Phantera: Template performance (learning loop, part 1).
 *
 * Closes the loop on copywriting: aggregate real outcomes (replies / meetings)
 * per email template so the copywriter can favour what actually works, instead
 * of being stateless. The product gets better the more the customer sends: a
 * compounding moat.
 *
 * Pure aggregation over send records; fully unit-testable.
 */

export interface SendOutcome {
  templateId: string
  replied: boolean
  meeting: boolean
}

export interface TemplateStats {
  templateId: string
  sends: number
  replies: number
  meetings: number
  replyRate: number   // 0-1
  meetingRate: number // 0-1
}

/** Aggregate per-template reply/meeting rates from raw send outcomes. */
export function aggregateTemplatePerformance(rows: SendOutcome[]): TemplateStats[] {
  const map = new Map<string, { sends: number; replies: number; meetings: number }>()
  for (const r of rows) {
    const e = map.get(r.templateId) ?? { sends: 0, replies: 0, meetings: 0 }
    e.sends += 1
    if (r.replied) e.replies += 1
    if (r.meeting) e.meetings += 1
    map.set(r.templateId, e)
  }
  return [...map.entries()].map(([templateId, e]) => ({
    templateId,
    sends: e.sends,
    replies: e.replies,
    meetings: e.meetings,
    replyRate: e.sends ? e.replies / e.sends : 0,
    meetingRate: e.sends ? e.meetings / e.sends : 0,
  }))
}

/**
 * Rank templates best-first by reply rate, considering only those with at least
 * `minSends` (avoids crowning a 1/1 fluke). Templates below the threshold are
 * dropped from the ranking (not enough signal yet).
 */
export function rankTemplates(stats: TemplateStats[], minSends = 20): TemplateStats[] {
  return stats
    .filter((s) => s.sends >= minSends)
    .sort((a, b) => b.replyRate - a.replyRate || b.meetingRate - a.meetingRate)
}

/** The best template id with enough signal, or null if none qualifies yet. */
export function bestTemplate(stats: TemplateStats[], minSends = 20): string | null {
  return rankTemplates(stats, minSends)[0]?.templateId ?? null
}
