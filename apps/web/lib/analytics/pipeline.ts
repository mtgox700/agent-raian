/**
 * Do recent cohorts catch up (the triangle), and how far do leads go, how
 * fast (the pipeline). Pure functions over the counts of queries.ts.
 *
 * A triangle cell is only complete when every lead of the week is old
 * enough for its checkpoint; a partly observed week is marked as such, and
 * a week too young shows nothing rather than a rate pushed down by leads
 * who have not had time to answer.
 */

import { MIN_DELAY_SAMPLE, rate, type Rate } from '@/lib/analyst/facts/campaign'
import { TRIANGLE_DAYS, type PipelineRow, type TriangleRow } from './queries'

export type CellState = 'complete' | 'partial' | 'pending'
export interface TriangleCell { day: number; rate: Rate; state: CellState }
export interface TriangleWeek { week: string; contacted: number; cells: TriangleCell[] }
export interface Triangle {
  days: readonly number[]
  weeks: TriangleWeek[]
  /** Per checkpoint, the complete weeks pooled: the reference a young week is read against. */
  reference: Array<Rate | null>
}

export function buildTriangle(rows: TriangleRow[]): Triangle {
  const weeks = rows.map((r) => ({
    week: r.week,
    contacted: r.contacted,
    cells: TRIANGLE_DAYS.map((day, i): TriangleCell => ({
      day,
      rate: rate(r.replied[i], r.mature[i]),
      state: r.mature[i] === 0 ? 'pending' : r.mature[i] < r.contacted ? 'partial' : 'complete',
    })),
  }))
  const reference = TRIANGLE_DAYS.map((_, i) => {
    const done = weeks.filter((w) => w.cells[i].state === 'complete')
    const n = done.reduce((a, w) => a + w.cells[i].rate.n, 0)
    return n > 0 ? rate(done.reduce((a, w) => a + w.cells[i].rate.successes, 0), n) : null
  })
  return { days: TRIANGLE_DAYS, weeks, reference }
}

export interface PipelineStage {
  key: 'contacted' | 'replied' | 'interested' | 'meeting' | 'won'
  label: string
  count: number
  /** Share of the contacted leads, with its interval (null for the first stage). */
  ofContacted: Rate | null
  /** Median days from first contact, among the leads who got there; null under 20 of them. */
  medianDays: number | null
  note?: string
}

export function buildPipeline(row: PipelineRow | null): PipelineStage[] {
  if (!row || row.contacted === 0) return []
  const share = (n: number) => rate(n, row.contacted)
  const median = (n: number, days: number | null) => (n >= MIN_DELAY_SAMPLE && days !== null ? Math.round(days * 10) / 10 : null)
  return [
    { key: 'contacted', label: 'Contactés', count: row.contacted, ofContacted: null, medianDays: null },
    { key: 'replied', label: 'Ont répondu', count: row.replied, ofContacted: share(row.replied), medianDays: median(row.replied, row.daysToReply) },
    { key: 'interested', label: 'Intéressés', count: row.interested, ofContacted: share(row.interested), medianDays: median(row.interested, row.daysToInterest), note: 'réponse positive classée par IA, ou qualifié à la main' },
    { key: 'meeting', label: 'Rendez-vous demandé', count: row.meeting, ofContacted: share(row.meeting), medianDays: null, note: 'classé par IA' },
    { key: 'won', label: 'Convertis', count: row.won, ofContacted: share(row.won), medianDays: median(row.won, row.daysToWon), note: 'saisi à la main dans Phantera' },
  ]
}
