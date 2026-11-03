/**
 * Phantera: LLM eval metrics (pure)
 *
 * Reusable, dependency-free scoring functions for evaluating the AI agents
 * (classification accuracy/F1, numeric calibration MAE/correlation). Used by the
 * agent eval suites so model/prompt changes are caught in CI before they ship.
 *
 * Everything here is pure and fully unit-testable.
 */

// ─── Classification metrics ──────────────────────────────────────────────────

export interface LabeledPrediction<L extends string> {
  expected: L
  predicted: L
}

/** Fraction of predictions that match the expected label (0..1). */
export function accuracy<L extends string>(rows: LabeledPrediction<L>[]): number {
  if (rows.length === 0) return 0
  const correct = rows.filter((r) => r.expected === r.predicted).length
  return correct / rows.length
}

export type ConfusionMatrix<L extends string> = Record<L, Record<L, number>>

/** Builds a confusion matrix over the given label set. */
export function confusionMatrix<L extends string>(rows: LabeledPrediction<L>[], labels: L[]): ConfusionMatrix<L> {
  const m = {} as ConfusionMatrix<L>
  for (const a of labels) {
    m[a] = {} as Record<L, number>
    for (const b of labels) m[a][b] = 0
  }
  for (const r of rows) {
    if (m[r.expected] && r.predicted in m[r.expected]) {
      m[r.expected][r.predicted] += 1
    }
  }
  return m
}

export interface ClassMetrics {
  precision: number
  recall: number
  f1: number
  support: number
}

/** Per-class precision / recall / F1. */
export function perClassF1<L extends string>(rows: LabeledPrediction<L>[], labels: L[]): Record<L, ClassMetrics> {
  const out = {} as Record<L, ClassMetrics>
  for (const label of labels) {
    const tp = rows.filter((r) => r.expected === label && r.predicted === label).length
    const fp = rows.filter((r) => r.expected !== label && r.predicted === label).length
    const fn = rows.filter((r) => r.expected === label && r.predicted !== label).length
    const support = rows.filter((r) => r.expected === label).length
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    out[label] = { precision, recall, f1, support }
  }
  return out
}

/** Unweighted mean of per-class F1 (macro-F1). */
export function macroF1<L extends string>(rows: LabeledPrediction<L>[], labels: L[]): number {
  if (labels.length === 0) return 0
  const per = perClassF1(rows, labels)
  const sum = labels.reduce((s, l) => s + per[l].f1, 0)
  return sum / labels.length
}

// ─── Numeric calibration metrics (lead scoring) ──────────────────────────────

export interface NumericPair {
  expected: number
  predicted: number
}

/** Mean absolute error. */
export function meanAbsoluteError(pairs: NumericPair[]): number {
  if (pairs.length === 0) return 0
  const sum = pairs.reduce((s, p) => s + Math.abs(p.expected - p.predicted), 0)
  return sum / pairs.length
}

/** Fraction of predictions within `tolerance` of the expected value (0..1). */
export function withinTolerance(pairs: NumericPair[], tolerance: number): number {
  if (pairs.length === 0) return 0
  const ok = pairs.filter((p) => Math.abs(p.expected - p.predicted) <= tolerance).length
  return ok / pairs.length
}

/**
 * Spearman rank correlation (−1..1): measures whether the model ranks leads in
 * the same order as the reference, which matters more than absolute score for a
 * prioritization task. Returns 0 for degenerate inputs.
 */
export function spearman(pairs: NumericPair[]): number {
  const n = pairs.length
  if (n < 2) return 0
  const rank = (values: number[]): number[] => {
    const indexed = values.map((v, i) => ({ v, i }))
    indexed.sort((a, b) => a.v - b.v)
    const ranks = new Array(n).fill(0)
    let i = 0
    while (i < n) {
      let j = i
      while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++
      const avgRank = (i + j) / 2 + 1 // 1-based average rank for ties
      for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank
      i = j + 1
    }
    return ranks
  }
  const rx = rank(pairs.map((p) => p.expected))
  const ry = rank(pairs.map((p) => p.predicted))
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const mx = mean(rx)
  const my = mean(ry)
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx
    const dy = ry[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return 0
  return cov / Math.sqrt(vx * vy)
}
