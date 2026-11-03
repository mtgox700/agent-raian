/**
 * What happened to the campaigns, to read a curve with: launches, pauses
 * (by hand or by the system), resumes, ends of sequence. Recorded by a
 * database trigger since STATUS_HISTORY_SINCE; nothing before is guessed.
 */

import type { StatusEventRow } from './queries'

/** The day the status history started (migration 20261019090000). */
export const STATUS_HISTORY_SINCE = '2026-10-19'

export type AnnotationKind = 'launch' | 'pause' | 'resume' | 'complete'

export const ANNOTATION_LABEL: Record<AnnotationKind, string> = {
  launch: 'lancement',
  pause: 'pause',
  resume: 'reprise',
  complete: 'fin de séquence',
}

export interface Annotation { kind: AnnotationKind; campaignId: string; campaign: string; at: string }
export interface AnnotatedWeek { week: string; events: Annotation[] }

export function kindOf(from: string | null, to: string): AnnotationKind | null {
  if (to === 'PAUSED') return 'pause'
  if (to === 'COMPLETED') return 'complete'
  if (to === 'ACTIVE') return from === 'PAUSED' ? 'resume' : 'launch'
  return null
}

/** Status changes grouped by Paris week, oldest first; a campaign left in draft is no event. */
export function buildAnnotations(rows: StatusEventRow[], names: Map<string, string>): AnnotatedWeek[] {
  const weeks = new Map<string, Annotation[]>()
  for (const r of rows) {
    const kind = kindOf(r.fromStatus, r.toStatus)
    if (!kind) continue
    const list = weeks.get(r.week) ?? []
    weeks.set(r.week, [...list, { kind, campaignId: r.campaignId, campaign: names.get(r.campaignId) ?? 'Campagne', at: new Date(r.at).toISOString() }])
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, events]) => ({ week, events }))
}

const ORDER: AnnotationKind[] = ['launch', 'resume', 'pause', 'complete']
const PLURAL: Record<AnnotationKind, string> = { launch: 'lancements', pause: 'pauses', resume: 'reprises', complete: 'fins de séquence' }

/** A week's events by kind: "Lancements : « A », « B » ; pause : « C »". */
export function describeWeek(events: Annotation[]): string {
  return ORDER
    .map((kind) => ({ kind, names: [...new Set(events.filter((e) => e.kind === kind).map((e) => `« ${e.campaign} »`))] }))
    .filter((g) => g.names.length > 0)
    .map((g, i) => {
      const label = g.names.length > 1 ? PLURAL[g.kind] : ANNOTATION_LABEL[g.kind]
      return `${i === 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label} : ${g.names.join(', ')}`
    })
    .join(' ; ')
}
