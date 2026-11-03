import { describe, expect, it } from 'vitest'
import { QUESTIONS } from './questions'
import { CAMPAIGNS } from '../../../scripts/analyst-eval-seed'

const KNOWN = new Set([...CAMPAIGNS.map((c) => c.key), 'quota'])

function campaignsOf(e: (typeof QUESTIONS)[number]['expected']): string[] {
  if ('campaign' in e) return [e.campaign]
  if ('campaigns' in e) return e.campaigns
  return []
}

describe('analyst evaluation set', () => {
  it('holds 60 questions and 20 traps with unique ids', () => {
    expect(QUESTIONS.filter((q) => !q.trap)).toHaveLength(60)
    expect(QUESTIONS.filter((q) => q.trap)).toHaveLength(20)
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length)
  })

  it('only refers to campaigns of the evaluation world', () => {
    for (const q of QUESTIONS) for (const key of campaignsOf(q.expected)) expect(KNOWN, q.id).toContain(key)
  })

  it('asks every question in words', () => {
    for (const q of QUESTIONS) expect(q.question.trim().length, q.id).toBeGreaterThan(10)
  })

  it('covers each family of trap', () => {
    const kinds = new Set(QUESTIONS.filter((q) => q.trap).map((q) => q.expected.type))
    for (const k of ['refuse_scope', 'no_leak', 'injection', 'out_of_scope', 'no_invented_number']) expect(kinds).toContain(k)
  })
})
