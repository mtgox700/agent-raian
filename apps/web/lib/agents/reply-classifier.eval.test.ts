/**
 * Eval suite — reply classifier.
 *
 * Two layers:
 *  1. Always-on: pure invariants (category→DB mapping, golden dataset integrity).
 *  2. Model-gated: runs the real LLM classifier over the golden set and asserts
 *     accuracy/F1 thresholds. Runs only when RUN_LLM_EVALS=1 (a reachable Ollama
 *     is required) — skipped otherwise so the suite stays green offline. This is
 *     the regression gate for prompt/model changes, run in a dedicated CI job.
 */

import { describe, it, expect } from 'vitest'
import { categoryToDb, REPLY_CATEGORIES, type ReplyCategory, type DbReplyClassification } from './reply-classifier'
import { REPLY_GOLDEN } from '@/lib/evals/datasets/reply-classifier.golden'
import { accuracy, macroF1, type LabeledPrediction } from '@/lib/evals/metrics'

describe('reply-classifier — pure invariants (always-on)', () => {
  it('maps every category to a valid DB enum value', () => {
    const valid: DbReplyClassification[] = ['POSITIVE', 'NEGATIVE', 'NEUTRAL']
    for (const c of REPLY_CATEGORIES) {
      expect(valid).toContain(categoryToDb(c))
    }
  })

  it('collapses positive intents to POSITIVE and rejections to NEGATIVE', () => {
    expect(categoryToDb('MEETING_REQUEST')).toBe('POSITIVE')
    expect(categoryToDb('POSITIVE')).toBe('POSITIVE')
    expect(categoryToDb('NOT_INTERESTED')).toBe('NEGATIVE')
    expect(categoryToDb('NEGATIVE')).toBe('NEGATIVE')
    expect(categoryToDb('NEUTRAL')).toBe('NEUTRAL')
  })

  it('golden dataset is well-formed and covers every category', () => {
    expect(REPLY_GOLDEN.length).toBeGreaterThanOrEqual(10)
    const ids = new Set(REPLY_GOLDEN.map((c) => c.id))
    expect(ids.size).toBe(REPLY_GOLDEN.length) // unique ids
    for (const c of REPLY_GOLDEN) {
      expect(REPLY_CATEGORIES).toContain(c.expected)
      expect(c.body.trim().length).toBeGreaterThan(0)
    }
    const covered = new Set(REPLY_GOLDEN.map((c) => c.expected))
    for (const cat of REPLY_CATEGORIES) expect(covered).toContain(cat)
  })
})

// ─── Model-gated regression gate ─────────────────────────────────────────────

const runEvals = process.env.RUN_LLM_EVALS === '1'

describe.skipIf(!runEvals)('reply-classifier — model eval (RUN_LLM_EVALS=1)', () => {
  it('classifies the golden set with accuracy ≥ 0.8 and macro-F1 ≥ 0.7', async () => {
    const { classifyReply } = await import('./reply-classifier')

    const fine: LabeledPrediction<ReplyCategory>[] = []
    const db: LabeledPrediction<DbReplyClassification>[] = []

    for (const c of REPLY_GOLDEN) {
      const res = await classifyReply(c.body, c.subject)
      fine.push({ expected: c.expected, predicted: res.classification })
      db.push({ expected: categoryToDb(c.expected), predicted: res.dbClassification })
    }

    const acc = accuracy(fine)
    const f1 = macroF1(fine, REPLY_CATEGORIES)
    const dbAcc = accuracy(db)

    // eslint-disable-next-line no-console
    console.info(`[eval reply-classifier] fine-acc=${acc.toFixed(2)} macroF1=${f1.toFixed(2)} db-acc=${dbAcc.toFixed(2)}`)

    expect(acc).toBeGreaterThanOrEqual(0.8)
    expect(f1).toBeGreaterThanOrEqual(0.7)
    expect(dbAcc).toBeGreaterThanOrEqual(0.85) // 3-class collapse should be easier
  }, 120_000)
})
