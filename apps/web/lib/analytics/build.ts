/**
 * Analytics, the honest part: from the counts of queries.ts to rates with
 * their 95 % Wilson interval, and comparisons tested by the facts engine
 * (lib/analyst/facts/compare). Pure functions, unit-tested.
 *
 * Rules (lib/analyst/facts/SIGNALS.md):
 *   - the lead is the unit; a reply rate is "replied within 7 days" over
 *     the leads first contacted at least 7 days ago (a younger lead has not
 *     had time to answer: counting it would push every recent rate down);
 *   - no trend arrow without a test: "significatif", "tendance" (to watch,
 *     not shown) or "insuffisant";
 *   - below MIN_SAMPLE a rate is shown as insufficient, never ranked.
 */

import { rate, type Rate } from '@/lib/analyst/facts/campaign'
import { compareRates, compareSegments, MIN_SAMPLE, type Verdict } from '@/lib/analyst/facts/compare'
import { THRESHOLDS } from '@/lib/analyst/facts/diagnose'
import type { BadgeRow, ChannelRow, ClassRow, CohortRow, DelayRow, HourRow, MailboxRow, StepRow } from './queries'
import { kaplanMeier, type Interval } from '@/lib/analyst/facts/stats'
import { BOUNCE_WATCH } from './filters'

const DAY = 86_400_000

export interface Trend { verdict: Verdict; delta: number; reason: string | null }

export interface Kpi {
  key: 'contacted' | 'reply' | 'positive' | 'bounce'
  label: string
  /** Rates only: the current period, its interval, and the tested change. */
  rate?: Rate
  previous?: Rate
  trend?: Trend
  /** Volumes only. */
  value?: number
  previousValue?: number
  note?: string
}

const PARIS_DAY = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

function paris(d: Date): string {
  return PARIS_DAY.format(d)
}

function sum(rows: CohortRow[]) {
  return rows.reduce((a, r) => ({
    contacted: a.contacted + r.contacted, mature: a.mature + r.mature,
    replied: a.replied + r.replied, positive: a.positive + r.positive,
  }), { contacted: 0, mature: 0, replied: 0, positive: 0 })
}

function trendOf(metric: string, cur: Rate, prev: Rate, confounders: string[]): Trend {
  const c = compareRates(metric, { label: 'période', successes: cur.successes, n: cur.n }, { label: 'période précédente', successes: prev.successes, n: prev.n }, { confounders })
  return { verdict: c.verdict, delta: c.delta, reason: c.reason }
}

/** Different campaigns in the two periods: the comparison mixes populations. */
function periodConfounders(current: CohortRow[], previous: CohortRow[]): string[] {
  const a = new Set(current.filter((r) => r.mature > 0).map((r) => r.campaignId))
  const b = new Set(previous.filter((r) => r.mature > 0).map((r) => r.campaignId))
  const same = a.size === b.size && [...a].every((x) => b.has(x))
  return same ? [] : ['campagnes différentes d’une période à l’autre']
}

export function splitPeriods(rows: CohortRow[], from: Date) {
  const cut = paris(from)
  return { current: rows.filter((r) => r.day >= cut), previous: rows.filter((r) => r.day < cut) }
}

export function buildKpis(rows: CohortRow[], from: Date, mailboxes: MailboxRow[], previousFrom: Date): Kpi[] {
  const { current, previous } = splitPeriods(rows, from)
  const cur = sum(current)
  const prev = sum(previous)
  const confounders = periodConfounders(current, previous)
  const reply = rate(cur.replied, cur.mature)
  const replyPrev = rate(prev.replied, prev.mature)
  const positive = rate(cur.positive, cur.mature)
  const positivePrev = rate(prev.positive, prev.mature)

  const weekCut = paris(from)
  const weekPrev = paris(previousFrom)
  const mb = (inCurrent: boolean) => mailboxes
    .filter((m) => (inCurrent ? m.week >= weekCut : m.week >= weekPrev && m.week < weekCut))
    .reduce((a, m) => ({ sent: a.sent + m.sent, bounced: a.bounced + m.bounced }), { sent: 0, bounced: 0 })
  const b = mb(true)
  const bp = mb(false)
  const bounce = rate(b.bounced, b.sent + b.bounced)
  const bouncePrev = rate(bp.bounced, bp.sent + bp.bounced)
  const young = cur.contacted - cur.mature

  return [
    { key: 'contacted', label: 'Leads contactés', value: cur.contacted, previousValue: prev.contacted },
    {
      key: 'reply', label: 'Réponse à J+7', rate: reply, previous: replyPrev, trend: trendOf('reponse', reply, replyPrev, confounders),
      note: young > 0 ? `${young} lead${young > 1 ? 's' : ''} contacté${young > 1 ? 's' : ''} depuis moins de 7 jours, pas encore compté${young > 1 ? 's' : ''}` : undefined,
    },
    { key: 'positive', label: 'Réponse positive à J+7', rate: positive, previous: positivePrev, trend: trendOf('reponse_positive', positive, positivePrev, confounders), note: 'classée par IA, non vérifiée' },
    { key: 'bounce', label: 'Rebonds', rate: bounce, previous: bouncePrev, trend: trendOf('rebond', bounce, bouncePrev, []), note: 'sur les emails envoyés' },
  ]
}

export interface CohortPoint {
  week: string // Monday, YYYY-MM-DD
  contacted: number
  mature: number
  rate: Rate
  /** Some leads of the week are younger than 7 days: the point will move. */
  provisional: boolean
}

function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10)
}

export function buildCohorts(rows: CohortRow[]): CohortPoint[] {
  const weeks = new Map<string, CohortRow[]>()
  for (const r of rows) {
    const w = mondayOf(r.day)
    weeks.set(w, [...(weeks.get(w) ?? []), r])
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, list]) => {
    const s = sum(list)
    return { week, contacted: s.contacted, mature: s.mature, rate: rate(s.replied, s.mature), provisional: s.mature < s.contacted }
  })
}

export interface LeaderRow {
  campaignId: string
  name: string
  rate: Rate
  verdict: Verdict | null
  /** Above or below the rest of the campaigns: proven when significatif, to watch when tendance. */
  direction: 'au-dessus' | 'en-dessous' | null
}

/**
 * Each campaign against all the others pooled, one corrected family
 * (Benjamini-Hochberg). Ranked by the lower bound of the interval: a small
 * lucky campaign cannot top a large steady one.
 */
export function buildLeaderboard(rows: CohortRow[], from: Date, names: Map<string, string>): { ranked: LeaderRow[]; insufficient: LeaderRow[]; pooled: Rate } {
  const { current } = splitPeriods(rows, from)
  const byCampaign = new Map<string, CohortRow[]>()
  for (const r of current) byCampaign.set(r.campaignId, [...(byCampaign.get(r.campaignId) ?? []), r])
  const total = sum(current)
  const entries = [...byCampaign.entries()].map(([id, list]) => [id, sum(list)] as const).filter(([, s]) => s.mature > 0)
  const enough = entries.filter(([, s]) => s.mature >= MIN_SAMPLE)
  const comparisons = enough.length >= 2 ? compareSegments('reponse', enough.map(([id, s]) => ({
    arm: { label: id, successes: s.replied, n: s.mature },
    rest: { label: 'les autres campagnes', successes: total.replied - s.replied, n: total.mature - s.mature },
    confounders: 'non évalués' as const,
  }))) : []
  const row = (id: string, s: ReturnType<typeof sum>, i: number | null): LeaderRow => {
    const c = i === null ? null : comparisons[i]
    return {
      campaignId: id, name: names.get(id) ?? 'Campagne', rate: rate(s.replied, s.mature),
      verdict: c?.verdict ?? null,
      direction: c && c.verdict !== 'insuffisant' ? (c.delta > 0 ? 'au-dessus' : 'en-dessous') : null,
    }
  }
  const ranked = enough.map(([id, s], i) => row(id, s, comparisons.length ? i : null)).sort((a, b) => b.rate.ci.low - a.rate.ci.low)
  const insufficient = entries.filter(([, s]) => s.mature < MIN_SAMPLE).map(([id, s]) => row(id, s, null)).sort((a, b) => b.rate.n - a.rate.n)
  return { ranked, insufficient, pooled: rate(total.replied, total.mature) }
}

export interface StepPoint {
  position: number
  channel: string
  reached: number
  /** Reached this step but not the next one (replied, stopped, or not due yet). Null on the last step sent. */
  dropped: number | null
  replyRate: Rate
  positive: number
  bounced: number
  /** No lead of the period has reached it yet. */
  pending: boolean
}

export function buildSteps(rows: StepRow[]): StepPoint[] {
  const merged = new Map<number, StepRow>()
  for (const r of rows) {
    const m = merged.get(r.position)
    merged.set(r.position, m
      ? { ...m, channel: m.channel === r.channel ? m.channel : 'MIXTE', reached: m.reached + r.reached, bounced: m.bounced + r.bounced, replied: m.replied + r.replied, positive: m.positive + r.positive }
      : r)
  }
  const list = [...merged.values()].sort((a, b) => a.position - b.position)
  return list.map((r, i) => {
    const next = list[i + 1]
    return {
      position: r.position, channel: r.channel, reached: r.reached, bounced: r.bounced, positive: r.positive,
      // A step nobody reached yet is not a loss: it is not due.
      dropped: next && next.reached > 0 ? Math.max(0, r.reached - next.reached) : null,
      replyRate: rate(r.replied, r.reached),
      pending: r.reached === 0,
    }
  })
}

export interface MailboxHealth {
  mailboxId: string
  label: string
  status: string
  sent: number
  bounce: Rate
  level: 'ok' | 'vigilance' | 'danger' | 'insuffisant'
  weeks: Array<{ week: string; bounce: Rate }>
}


export function buildMailboxes(rows: MailboxRow[], from: Date, labels: Map<string, { label: string; status: string }>): MailboxHealth[] {
  const cut = paris(from)
  const ids = [...new Set(rows.map((r) => r.mailboxId))]
  return ids.map((id) => {
    const mine = rows.filter((r) => r.mailboxId === id)
    const cur = mine.filter((r) => r.week >= mondayOf(cut)).reduce((a, r) => ({ sent: a.sent + r.sent, bounced: a.bounced + r.bounced }), { sent: 0, bounced: 0 })
    const bounce = rate(cur.bounced, cur.sent + cur.bounced)
    const level = bounce.n < THRESHOLDS.bounceMinAttempts ? 'insuffisant' : bounce.rate >= THRESHOLDS.bounceRate ? 'danger' : bounce.rate >= BOUNCE_WATCH ? 'vigilance' : 'ok'
    return {
      mailboxId: id, label: labels.get(id)?.label ?? 'Boîte supprimée', status: labels.get(id)?.status ?? 'INCONNU',
      sent: cur.sent, bounce, level,
      weeks: mine.sort((a, b) => a.week.localeCompare(b.week)).map((r) => ({ week: r.week, bounce: rate(r.bounced, r.sent + r.bounced) })),
    } satisfies MailboxHealth
  }).sort((a, b) => b.bounce.rate - a.bounce.rate)
}

// ─── A2 ──────────────────────────────────────────────────────────────────────

/** Below this many replies, a delay curve says more about luck than about prospects. */
export const MIN_DELAY_EVENTS = 20

export interface DelayCurve {
  /** Cumulative share of contacted leads who have replied by day t (1 − survival). */
  points: Array<{ t: number; replied: number; ci: Interval }>
  events: number
  leads: number
  /** Share of all the replies observed so far that came by J+3, J+7, J+14. */
  marks: Array<{ day: number; share: number }>
  enough: boolean
}

export function buildDelay(rows: DelayRow[]): DelayCurve {
  const events = rows.reduce((a, r) => a + r.events, 0)
  const leads = rows.reduce((a, r) => a + r.events + r.censored, 0)
  const km = kaplanMeier(rows.map((r) => ({ t: r.day, events: r.events, censored: r.censored })))
  const points = [{ t: 0, replied: 0, ci: { low: 0, high: 0 } }, ...km.map((p) => ({ t: p.t, replied: 1 - p.survival, ci: { low: 1 - p.ci.high, high: 1 - p.ci.low } }))]
  const total = points.at(-1)?.replied ?? 0
  const at = (day: number) => [...points].reverse().find((p) => p.t <= day)?.replied ?? 0
  return {
    points, events, leads, enough: events >= MIN_DELAY_EVENTS,
    marks: total > 0 ? [3, 7, 14].map((day) => ({ day, share: at(day) / total })) : [],
  }
}

const BADGE_ORDER = ['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP', 'UNSCORED']
export const BADGE_LABEL: Record<string, string> = { FAST_TRACK: 'Fast Track', NORMAL: 'Normal', NURTURE: 'Nurture', SKIP: 'Écarté', UNSCORED: 'Non scoré' }

export interface Calibration {
  badges: Array<{ badge: string; rate: Rate; enough: boolean }>
  /** Does Fast Track really reply more than Normal? Null when either is too small. */
  topVsNormal: { verdict: Verdict; delta: number } | null
  coverage: Rate
}

export function buildCalibration(rows: BadgeRow[]): Calibration {
  const by = new Map(rows.map((r) => [r.badge, r]))
  const badges = BADGE_ORDER.filter((b) => by.has(b)).map((b) => {
    const r = by.get(b)!
    return { badge: b, rate: rate(r.replied, r.mature), enough: r.mature >= MIN_SAMPLE }
  })
  const ft = by.get('FAST_TRACK')
  const nm = by.get('NORMAL')
  let topVsNormal: Calibration['topVsNormal'] = null
  if (ft && nm && ft.mature >= MIN_SAMPLE && nm.mature >= MIN_SAMPLE) {
    const c = compareRates('reponse', { label: 'Fast Track', successes: ft.replied, n: ft.mature }, { label: 'Normal', successes: nm.replied, n: nm.mature }, { confounders: 'non évalués' })
    topVsNormal = { verdict: c.verdict, delta: c.delta }
  }
  const total = rows.reduce((a, r) => a + r.mature, 0)
  const scored = rows.filter((r) => r.badge !== 'UNSCORED').reduce((a, r) => a + r.mature, 0)
  return { badges, topVsNormal, coverage: rate(scored, total) }
}

export interface MixWeek { week: string; total: number; positive: number; negative: number; neutral: number; positiveRate: Rate }

export function buildMix(rows: ClassRow[]): MixWeek[] {
  const weeks = new Map<string, Omit<MixWeek, 'positiveRate'>>()
  for (const r of rows) {
    const w = weeks.get(r.week) ?? { week: r.week, total: 0, positive: 0, negative: 0, neutral: 0 }
    const key = r.classification === 'POSITIVE' || r.classification === 'MEETING_REQUEST' ? 'positive'
      : r.classification === 'NEGATIVE' || r.classification === 'NOT_INTERESTED' ? 'negative' : 'neutral'
    weeks.set(r.week, { ...w, [key]: w[key] + r.leads, total: w.total + r.leads })
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({ ...w, positiveRate: rate(w.positive, w.total) }))
}

export interface HeatGrid { sent: number[][]; replied: number[][]; maxSent: number; maxReplied: number; totalSent: number; totalReplied: number }

/** 7 rows (Monday first) × 24 hours, Paris time. */
export function buildHeatmap(rows: HourRow[]): HeatGrid {
  const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  const sent = grid()
  const replied = grid()
  for (const r of rows) {
    if (r.dow < 1 || r.dow > 7 || r.hour < 0 || r.hour > 23) continue
    sent[r.dow - 1][r.hour] += r.sent
    replied[r.dow - 1][r.hour] += r.replied
  }
  const all = (g: number[][]) => g.flat()
  return {
    sent, replied,
    maxSent: Math.max(0, ...all(sent)), maxReplied: Math.max(0, ...all(replied)),
    totalSent: all(sent).reduce((a, b) => a + b, 0), totalReplied: all(replied).reduce((a, b) => a + b, 0),
  }
}

export interface ChannelPoint { channel: string; reached: number; rate: Rate | null; note: string | null }

/** Replies to SMS and WhatsApp arrive on the phone, outside Phantera: not measured, never 0 %. */
const UNMEASURED = new Set(['SMS', 'WHATSAPP'])

export function buildChannels(rows: ChannelRow[]): ChannelPoint[] {
  return rows.filter((r) => r.reached > 0).sort((a, b) => b.reached - a.reached).map((r) => UNMEASURED.has(r.channel)
    ? { channel: r.channel, reached: r.reached, rate: null, note: 'réponses reçues sur le téléphone : non mesurées' }
    : { channel: r.channel, reached: r.reached, rate: rate(r.replied, r.reached), note: null })
}
