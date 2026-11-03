/** French figures of the analytics page: a rate with its interval, counts with a thin space. */
import { formatPercent } from '@/lib/format/percent'
import type { Rate } from '@/lib/front/types-analytics'

export const pct = (r: Rate) => formatPercent(r.rate * 100)
export const ci = (r: Rate) => `${formatPercent(r.ci.low * 100)} à ${formatPercent(r.ci.high * 100)}`
export const nf = (n: number) => n.toLocaleString('fr-FR')
export const p = (v: number) => formatPercent(v * 100)

/** "12 mars 2026" (the day of a week, read at noon UTC so it never shifts). */
export const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
/** "12 mars". */
export const weekLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
/** "+3,4": a delta in points, one decimal, signed when positive. */
export const signedPoints = (delta: number) => (delta * 100 > 0 ? '+' : '') + (delta * 100).toFixed(1).replace('.', ',')
/** "3,4": an absolute value in points. */
export const pointsValue = (delta: number) => (delta * 100).toFixed(1).replace('.', ',')

/** Rate tones, the same on every panel: never the colour alone (a word goes with it). */
export const VERDICT_TONE = {
  good: 'border-success/40 text-success',
  bad: 'border-danger/40 text-danger',
  watch: 'border-warning/40 text-warning',
} as const
