import { describe, expect, it } from 'vitest'
import { citableNumbers, numbersIn, verifyAnswer } from './verify'
import type { ToolResult } from './tools'

const T1: ToolResult = {
  ref: 'T1', tool: 'campaign_facts', ok: true,
  data: {
    campaign: { id: 'c1', name: 'CTO SaaS', status: 'ACTIVE' },
    overview: { firstSentAt: '2026-10-11T08:00:00.000Z', ageDays: 6, leads: { total: 160, contacted: 120, replied: 0 }, replyRate: { successes: 0, n: 120, rate: 0, ci: { low: 0, high: 0.0311 } } },
    queue: { queued: 140, hold: 'MAILBOX_DISCONNECTED' },
  },
}
const T2: ToolResult = {
  ref: 'T2', tool: 'compare_campaigns', ok: true,
  data: { metric: 'reponse', comparisons: [{ a: { label: 'DRH', successes: 59, n: 1000, rate: 0.059 }, b: { label: 'CTO', successes: 30, n: 1000, rate: 0.03 }, delta: 0.029, verdict: 'tendance', reason: 'À surveiller, non démontré (p = 0,120).' }] },
}
const T3: ToolResult = {
  ref: 'T3', tool: 'compare_campaigns', ok: true,
  data: { metric: 'reponse', comparisons: [{ a: { label: 'A', successes: 45, n: 100, rate: 0.45 }, b: { label: 'B', successes: 30, n: 100, rate: 0.3 }, delta: 0.15, verdict: 'significatif' }] },
}

const wrap = (body: string, actions = '- Reconnecter la boîte : les messages repartent ; effet certain.') => `**Réponse** ${body}

**Preuves**
- 140 messages attendent en file [T1].

**Ce qu'on ne sait pas**
Si le message lui-même est bon.

**Que faire**
${actions}`

describe('numbers', () => {
  it('reads French numbers: 10 000, 4,8 %, -2', () => {
    expect(numbersIn('10 000 envois, 4,8 % et -2 points')).toEqual(['10000', '4.8', '-2'])
  })

  it('reads thousands split by a non-breaking or narrow space', () => {
    expect(numbersIn('10 000 envois et 1 250 leads')).toEqual(['10000', '1250'])
  })

  it('ignores rule vocabulary (J+7, P90) and citations', () => {
    expect(numbersIn('à J+7, au P90 [T12]')).toEqual([])
  })

  it('a rate may be written as a percentage, rounded to 0 or 1 decimal', () => {
    const set = citableNumbers({ rate: 0.0482 })
    for (const s of ['0.0482', '4.8', '5']) expect(set.has(s)).toBe(true)
    expect(set.has('4.9')).toBe(false)
  })

  it('numbers written by the facts engine are citable, never those of a name', () => {
    const set = citableNumbers({ name: 'Campagne 45 %', diagnoses: [{ title: 'La campagne ne peut pas envoyer', evidence: ['140 messages en file', 'taux 7,2 %'] }] })
    expect(set.has('140')).toBe(true)
    expect(set.has('7.2')).toBe(true)
    expect(set.has('45')).toBe(false)
  })

  it('dates contribute their day, month and year', () => {
    expect([...citableNumbers({ at: '2026-10-11T08:00:00Z' })]).toEqual(expect.arrayContaining(['2026', '10', '11']))
  })
})

describe('verifyAnswer', () => {
  it('accepts an answer whose every number is sourced and cited', () => {
    const answer = wrap('ta campagne ne part plus : 140 messages sont bloqués [T1], 0 réponse sur 120 leads contactés [T1].')
    expect(verifyAnswer(answer, [T1])).toEqual({ ok: true, faults: [] })
  })

  it('refuses an invented number', () => {
    const v = verifyAnswer(wrap('le taux de réponse est de 12 % [T1].'), [T1])
    expect(v.faults.map((f) => f.kind)).toContain('nombre_non_source')
  })

  it('refuses a true number cited from the wrong result', () => {
    const v = verifyAnswer(wrap('DRH répond à 5,9 % [T1].'), [T1, T2])
    expect(v.faults).toContainEqual(expect.objectContaining({ kind: 'nombre_mal_attribue' }))
  })

  it('refuses a number without citation, and an unknown citation', () => {
    expect(verifyAnswer(wrap('il reste 140 messages en file.'), [T1]).faults.map((f) => f.kind)).toContain('nombre_sans_citation')
    expect(verifyAnswer(wrap('voir [T9].'), [T1]).faults.map((f) => f.kind)).toContain('citation_inconnue')
  })

  it('refuses to strengthen a trend, accepts it when the comparison is significant', () => {
    expect(verifyAnswer(wrap('DRH est plus efficace que CTO : 5,9 % contre 3 % [T2].'), [T1, T2]).faults.map((f) => f.kind)).toContain('verdict_renforce')
    expect(verifyAnswer(wrap('DRH répond plus, 5,9 % contre 3 % [T2], à surveiller, non démontré.'), [T1, T2]).ok).toBe(true)
    expect(verifyAnswer(wrap('A est meilleure que B : 45 % contre 30 % [T3].'), [T1, T3]).ok).toBe(true)
  })

  it('requires the four sections and at most three actions', () => {
    expect(verifyAnswer('140 messages en file [T1].', [T1]).faults.filter((f) => f.kind === 'structure')).toHaveLength(4)
    const four = '- a\n- b\n- c\n- d'
    expect(verifyAnswer(wrap('rien à signaler.', four), [T1]).faults.map((f) => f.kind)).toContain('trop_d_actions')
  })

  it('list numbering is not a number to source', () => {
    expect(verifyAnswer(wrap('voir ci-dessous.', '1. Reconnecter la boîte.\n2. Relancer la campagne.'), [T1]).ok).toBe(true)
  })
})

describe('review fixes (2026-10-18)', () => {
  it('« grâce à » strengthens a trend, like the other strong words', () => {
    const answer = wrap('les DRH répondent grâce à la relance [T2].')
    expect(verifyAnswer(answer, [T1, T2]).faults.map((f) => f.kind)).toContain('verdict_renforce')
  })

  it('a strong word without digit nor citation is caught when the cited comparison is not significant', () => {
    const answer = wrap('les DRH sont plus efficaces. Écart de 2,9 points [T2].')
    expect(verifyAnswer(answer, [T1, T2]).faults.map((f) => f.kind)).toContain('verdict_renforce')
    expect(verifyAnswer(wrap('A est la meilleure. Écart de 15 points [T3].'), [T1, T3]).ok).toBe(true)
  })

  it('an answer built on data must cite it', () => {
    const answer = '**Réponse** Alpha est en bonne santé.\n\n**Preuves**\n- rien\n\n**Ce qu’on ne sait pas**\n- tout\n\n**Que faire**\n1. Attendre.'
    expect(verifyAnswer(answer, [T1]).faults.map((f) => f.kind)).toContain('sans_preuve')
  })

  it('numbers glued to a unit are numbers, ordinals are not', () => {
    expect(numbersIn('relancer à 7j, puis 3h plus tard')).toEqual(['7', '3'])
    expect(numbersIn('le 1er message, la 2e étape, le 3ème envoi')).toEqual([])
    expect(numbersIn('campagne B2B du Q4')).toEqual([])
  })
})
