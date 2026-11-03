/**
 * The analytics filters, carried by the URL (?p=30d&c=id1,id2&vs=id3) so a view can
 * be shared and survives a reload. Validated here: an unknown period falls
 * back to 30 days, and only campaigns the viewer can see are kept.
 */

export const PERIODS = { '7d': 7, '30d': 30, '90d': 90 } as const
export type PeriodKey = keyof typeof PERIODS

export const REPLY_WINDOW_DAYS = 7

/** 2 %: the large mailbox providers' watch zone (the danger threshold, 5 %, is the facts engine's). */
export const BOUNCE_WATCH = 0.02

export interface AnalyticsFilters {
  period: PeriodKey
  days: number
  /** Campaigns asked for, already restricted to the visible ones; empty = all visible. */
  campaignIds: string[]
  /** Comparison mode: the other side (visible, not in campaignIds); empty = no comparison. */
  versusIds: string[]
  now: Date
  from: Date
  previousFrom: Date
}

const DAY = 86_400_000

export function parseFilters(params: Record<string, string | string[] | undefined>, visibleIds: string[], now = new Date()): AnalyticsFilters {
  const p = typeof params.p === 'string' && params.p in PERIODS ? (params.p as PeriodKey) : '30d'
  const days = PERIODS[p]
  const visible = new Set(visibleIds)
  const ids = (v: unknown) => (typeof v === 'string' ? [...new Set(v.split(',').map((s) => s.trim()).filter((id) => visible.has(id)))] : [])
  const campaignIds = ids(params.c)
  // A campaign is on one side only.
  const versusIds = ids(params.vs).filter((id) => !campaignIds.includes(id))
  const from = new Date(now.getTime() - days * DAY)
  return { period: p, days, campaignIds, versusIds, now, from, previousFrom: new Date(from.getTime() - days * DAY) }
}

/** The query string for a set of filters (the client builds links with it). */
export function filtersQuery(period: PeriodKey, campaignIds: string[], versusIds: string[] = []): string {
  const q = new URLSearchParams()
  if (period !== '30d') q.set('p', period)
  if (campaignIds.length) q.set('c', campaignIds.join(','))
  if (versusIds.length) q.set('vs', versusIds.join(','))
  const s = q.toString()
  return s ? `?${s}` : ''
}
