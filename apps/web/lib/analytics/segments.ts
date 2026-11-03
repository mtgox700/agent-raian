/**
 * Who to target: reply at J+7 by level, industry, company size and country,
 * each segment tested against the rest of its dimension (Benjamini-Hochberg
 * across the segments of a dimension), and the level × industry matrix.
 *
 * Titles are free text: they are compared by level (seniorityOf), never one
 * by one. Several campaigns mixed means other differences (message, period,
 * mailbox) are not checked, so a verdict stays "à surveiller" at best; one
 * campaign alone can reach "significatif".
 */

import { rate, type Rate } from '@/lib/analyst/facts/campaign'
import { compareSegments, MIN_SAMPLE, type Verdict } from '@/lib/analyst/facts/compare'
import { SENIORITY_LABEL, SENIORITY_ORDER, seniorityOf } from '@/lib/leads/seniority'
import type { SegmentRow } from './queries'

export type SegmentDimension = 'seniority' | 'industry' | 'companySize' | 'country'

export const DIMENSION_LABEL: Record<SegmentDimension, string> = {
  seniority: 'Niveau de poste',
  industry: 'Secteur',
  companySize: 'Taille d’entreprise',
  country: 'Pays',
}

/** Segments shown per dimension; the smaller ones are pooled, not tested. */
export const MAX_SEGMENTS = 8
/** Industries in the matrix's columns. */
export const MATRIX_COLUMNS = 5

const SIZE_LABEL: Record<string, string> = { XS: '1 à 10', S: '11 à 50', M: '51 à 200', L: '201 à 1 000', XL: 'plus de 1 000' }
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL']

export interface SegmentPoint {
  value: string
  label: string
  rate: Rate
  verdict: Verdict | null
  direction: 'au-dessus' | 'en dessous' | null
  /** Pooled small segments: shown for completeness, never tested. */
  pooled: boolean
}

export interface SegmentBreakdown {
  dimension: SegmentDimension
  title: string
  /** At least two known values: otherwise there is nothing to compare. */
  comparable: boolean
  segments: SegmentPoint[]
  /** Leads with the field empty: outside the comparison. */
  unknown: Rate
  measured: number
}

export interface MatrixCell { rate: Rate; enough: boolean }
export interface SegmentMatrix {
  columns: Array<{ value: string; label: string }>
  rows: Array<{ value: string; label: string; cells: MatrixCell[]; total: Rate }>
}

export interface Segments { breakdowns: SegmentBreakdown[]; matrix: SegmentMatrix; singleCampaign: boolean }

function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1) : s
}

function labelOf(dimension: SegmentDimension, value: string, typed?: string | null): string {
  if (dimension === 'seniority') return SENIORITY_LABEL[value as keyof typeof SENIORITY_LABEL] ?? value
  if (dimension === 'companySize') return SIZE_LABEL[value] ?? value
  // As the user typed it when it has capitals ("SaaS", "PME"), else capitalised.
  if (typed && typed !== typed.toLowerCase()) return typed
  if (dimension === 'country' && value.length <= 3) return value.toUpperCase()
  return capitalize(value)
}

function typedOf(dimension: SegmentDimension, r: SegmentRow): string | null | undefined {
  return dimension === 'industry' ? r.industryLabel : dimension === 'country' ? r.countryLabel : null
}

type Counts = { mature: number; replied: number }

function add(map: Map<string, Counts>, key: string, r: Counts): void {
  const c = map.get(key) ?? { mature: 0, replied: 0 }
  map.set(key, { mature: c.mature + r.mature, replied: c.replied + r.replied })
}

function valueOf(dimension: SegmentDimension, r: SegmentRow): string {
  if (dimension === 'seniority') return r.title ? seniorityOf(r.title) : ''
  return (dimension === 'industry' ? r.industry : dimension === 'companySize' ? r.companySize : r.country) ?? ''
}

const SOURCE: Record<SegmentDimension, SegmentRow['set']> = { seniority: 'title', industry: 'industry', companySize: 'companySize', country: 'country' }

function ordered(dimension: SegmentDimension, entries: Array<[string, Counts]>): Array<[string, Counts]> {
  const fixed = dimension === 'seniority' ? SENIORITY_ORDER as string[] : dimension === 'companySize' ? SIZE_ORDER : null
  return fixed
    ? [...entries].sort((a, b) => fixed.indexOf(a[0]) - fixed.indexOf(b[0]))
    : [...entries].sort((a, b) => b[1].mature - a[1].mature || a[0].localeCompare(b[0]))
}

export function buildBreakdown(rows: SegmentRow[], dimension: SegmentDimension, singleCampaign: boolean): SegmentBreakdown {
  const counts = new Map<string, Counts>()
  const typed = new Map<string, string>()
  for (const r of rows) {
    if (r.set !== SOURCE[dimension]) continue
    const value = valueOf(dimension, r)
    add(counts, value, r)
    const t = typedOf(dimension, r)
    if (t) typed.set(value, t)
  }
  const unknown = counts.get('') ?? { mature: 0, replied: 0 }
  counts.delete('')

  const all = ordered(dimension, [...counts.entries()])
  const bySize = [...all].sort((a, b) => b[1].mature - a[1].mature)
  const kept = new Set(bySize.slice(0, MAX_SEGMENTS).map(([k]) => k))
  const shown = all.filter(([k]) => kept.has(k))
  const rest = all.filter(([k]) => !kept.has(k)).reduce((a, [, c]) => ({ mature: a.mature + c.mature, replied: a.replied + c.replied }), { mature: 0, replied: 0 })
  const total = all.reduce((a, [, c]) => ({ mature: a.mature + c.mature, replied: a.replied + c.replied }), { mature: 0, replied: 0 })

  const comparisons = compareSegments('reponse', shown.map(([value, c]) => ({
    arm: { label: value, successes: c.replied, n: c.mature },
    rest: { label: 'les autres', successes: total.replied - c.replied, n: total.mature - c.mature },
    confounders: singleCampaign ? [] : 'non évalués' as const,
  })))

  const segments: SegmentPoint[] = shown.map(([value, c], i) => {
    const cmp = comparisons[i]
    const tested = cmp.verdict !== 'insuffisant'
    return {
      value, label: labelOf(dimension, value, typed.get(value)), rate: rate(c.replied, c.mature), pooled: false,
      verdict: cmp.verdict,
      direction: tested && cmp.delta !== 0 ? (cmp.delta > 0 ? 'au-dessus' : 'en dessous') : null,
    }
  })
  if (rest.mature > 0) segments.push({ value: '__autres', label: `Autres (${all.length - shown.length})`, rate: rate(rest.replied, rest.mature), verdict: null, direction: null, pooled: true })

  return { dimension, title: DIMENSION_LABEL[dimension], comparable: all.length >= 2, segments, unknown: rate(unknown.replied, unknown.mature), measured: total.mature }
}

export function buildMatrix(rows: SegmentRow[]): SegmentMatrix {
  const cells = new Map<string, Counts>()
  const industries = new Map<string, Counts>()
  const typed = new Map<string, string>()
  for (const r of rows) {
    if (r.set !== 'titleIndustry' || !r.industry) continue
    const level = r.title ? seniorityOf(r.title) : ''
    if (!level) continue
    add(cells, `${level}\u0000${r.industry}`, r)
    add(industries, r.industry, r)
    if (r.industryLabel) typed.set(r.industry, r.industryLabel)
  }
  const columns = [...industries.entries()].sort((a, b) => b[1].mature - a[1].mature).slice(0, MATRIX_COLUMNS).map(([value]) => ({ value, label: labelOf('industry', value, typed.get(value)) }))
  const levels = SENIORITY_ORDER.filter((lv) => columns.some((c) => cells.has(`${lv}\u0000${c.value}`)))
  return {
    columns,
    rows: levels.map((lv) => {
      const row = columns.map((c) => cells.get(`${lv}\u0000${c.value}`) ?? { mature: 0, replied: 0 })
      const sum = row.reduce((a, c) => ({ mature: a.mature + c.mature, replied: a.replied + c.replied }), { mature: 0, replied: 0 })
      return {
        value: lv, label: SENIORITY_LABEL[lv],
        cells: row.map((c) => ({ rate: rate(c.replied, c.mature), enough: c.mature >= MIN_SAMPLE })),
        total: rate(sum.replied, sum.mature),
      }
    }),
  }
}

export function buildSegments(rows: SegmentRow[], singleCampaign: boolean): Segments {
  return {
    breakdowns: (Object.keys(DIMENSION_LABEL) as SegmentDimension[]).map((d) => buildBreakdown(rows, d, singleCampaign)),
    matrix: buildMatrix(rows),
    singleCampaign,
  }
}
