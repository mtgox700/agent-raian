import { describe, it, expect } from 'vitest'
import {
  accuracy,
  confusionMatrix,
  perClassF1,
  macroF1,
  meanAbsoluteError,
  withinTolerance,
  spearman,
} from './metrics'

type L = 'A' | 'B' | 'C'
const labels: L[] = ['A', 'B', 'C']

describe('accuracy', () => {
  it('is 1 when all correct', () => {
    expect(accuracy([{ expected: 'A', predicted: 'A' }, { expected: 'B', predicted: 'B' }])).toBe(1)
  })
  it('is 0.5 on half correct', () => {
    expect(accuracy([{ expected: 'A', predicted: 'A' }, { expected: 'B', predicted: 'C' }])).toBe(0.5)
  })
  it('handles empty', () => {
    expect(accuracy([])).toBe(0)
  })
})

describe('confusionMatrix', () => {
  it('counts predictions per (expected, predicted)', () => {
    const m = confusionMatrix<L>(
      [
        { expected: 'A', predicted: 'A' },
        { expected: 'A', predicted: 'B' },
        { expected: 'B', predicted: 'B' },
      ],
      labels,
    )
    expect(m.A.A).toBe(1)
    expect(m.A.B).toBe(1)
    expect(m.B.B).toBe(1)
    expect(m.C.C).toBe(0)
  })
})

describe('perClassF1 / macroF1', () => {
  it('computes perfect F1 when all correct', () => {
    const rows = [
      { expected: 'A' as L, predicted: 'A' as L },
      { expected: 'B' as L, predicted: 'B' as L },
    ]
    const per = perClassF1(rows, labels)
    expect(per.A.f1).toBe(1)
    expect(per.B.f1).toBe(1)
    expect(per.C.f1).toBe(0) // no support → 0
  })
  it('macroF1 averages across labels', () => {
    const rows = [
      { expected: 'A' as L, predicted: 'A' as L },
      { expected: 'B' as L, predicted: 'A' as L }, // B misclassified
    ]
    const f1 = macroF1(rows, labels)
    expect(f1).toBeGreaterThanOrEqual(0)
    expect(f1).toBeLessThanOrEqual(1)
  })
})

describe('numeric metrics', () => {
  it('meanAbsoluteError', () => {
    expect(meanAbsoluteError([{ expected: 80, predicted: 75 }, { expected: 50, predicted: 55 }])).toBe(5)
  })
  it('withinTolerance', () => {
    expect(withinTolerance([{ expected: 80, predicted: 75 }, { expected: 50, predicted: 60 }], 6)).toBe(0.5)
  })
  it('spearman is 1 for perfectly rank-correlated data', () => {
    const pairs = [
      { expected: 10, predicted: 1 },
      { expected: 20, predicted: 2 },
      { expected: 30, predicted: 3 },
    ]
    expect(spearman(pairs)).toBeCloseTo(1, 5)
  })
  it('spearman is -1 for inverted rank', () => {
    const pairs = [
      { expected: 10, predicted: 3 },
      { expected: 20, predicted: 2 },
      { expected: 30, predicted: 1 },
    ]
    expect(spearman(pairs)).toBeCloseTo(-1, 5)
  })
  it('spearman handles degenerate input', () => {
    expect(spearman([{ expected: 5, predicted: 5 }])).toBe(0)
  })
})
