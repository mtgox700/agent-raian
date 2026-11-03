/**
 * What a sweep changes, decided without the database: the alerts found now
 * against the alerts on record.
 *
 *   new cause                      opened, notified
 *   cause seen again, open         refreshed, silent
 *   cause seen again, resolved     reopened, notified
 *   cause seen again, snoozed      refreshed and silent until the snooze ends,
 *                                  then reopened and notified once
 *   cause gone                     resolved, silent
 *   campaign that could not be read this time: its alerts are left as they
 *   are (an error must not look like a recovery)
 */

import type { DetectedInsight } from './detect'

export interface InsightRecord {
  id: string
  key: string
  campaignId: string | null
  status: 'OPEN' | 'SNOOZED' | 'RESOLVED'
  snoozedUntil: Date | null
}

export type InsightOp =
  | { op: 'open'; insight: DetectedInsight; notify: boolean }
  | { op: 'reopen'; id: string; insight: DetectedInsight; notify: boolean }
  | { op: 'refresh'; id: string; insight: DetectedInsight }
  | { op: 'resolve'; id: string }

export function reconcile(records: InsightRecord[], detected: DetectedInsight[], unreadable: Set<string>, now: Date): InsightOp[] {
  const byKey = new Map(records.map((r) => [r.key, r]))
  const seen = new Set<string>()
  const ops: InsightOp[] = []
  for (const d of detected) {
    if (seen.has(d.key)) continue
    seen.add(d.key)
    const r = byKey.get(d.key)
    if (!r) { ops.push({ op: 'open', insight: d, notify: d.notify }); continue }
    if (r.status === 'RESOLVED') { ops.push({ op: 'reopen', id: r.id, insight: d, notify: d.notify }); continue }
    if (r.status === 'SNOOZED' && r.snoozedUntil && r.snoozedUntil <= now) { ops.push({ op: 'reopen', id: r.id, insight: d, notify: d.notify }); continue }
    ops.push({ op: 'refresh', id: r.id, insight: d })
  }
  for (const r of records) {
    if (r.status === 'RESOLVED' || seen.has(r.key)) continue
    if (r.campaignId && unreadable.has(r.campaignId)) continue
    ops.push({ op: 'resolve', id: r.id })
  }
  return ops
}
