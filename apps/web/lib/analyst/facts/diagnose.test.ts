import { describe, expect, it } from 'vitest'
import { diagnose, frenchMoment, THRESHOLDS } from './diagnose'
import { SCENARIOS, buildFacts } from '../evals/fixtures'

describe('diagnose() against the reference scenarios', () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))('%s', (_name, scenario) => {
    expect(diagnose(scenario.facts).map((d) => d.code).sort()).toEqual([...scenario.expected].sort())
  })

  it('no diagnosis at all on the healthy campaigns', () => {
    for (const s of SCENARIOS.filter((x) => x.expected.length === 0)) expect(diagnose(s.facts)).toEqual([])
  })
})

describe('each diagnosis carries its evidence and its rule', () => {
  it('a stalled campaign names the cause', () => {
    const [d] = diagnose(SCENARIOS.find((s) => s.name === 'bloquée par une boîte déconnectée')!.facts)
    expect(d.severity).toBe('bloquant')
    expect(d.evidence.join(' ')).toContain('140 messages en file')
    expect(d.evidence.join(' ')).toContain('déconnectée')
  })

  it('silence counts leads and quotes the interval of that same count', () => {
    const [d] = diagnose(SCENARIOS.find((s) => s.name === 'message long sans question')!.facts)
    expect(d.evidence[0]).toMatch(/0 lead sur 150 contactés .*intervalle à 95 % : 0,0 % à 2,5 %/)
    expect(d.evidence[1]).toContain('180 mots, 0 question')
  })

  it('blocking issues come first', () => {
    const facts = buildFacts({ ageDays: 3, steps: [{ sent: 20, queued: 10 }], hold: 'QUOTA' })
    expect(diagnose(facts).map((d) => d.severity)).toEqual(['bloquant', 'info'])
  })

  it('a rate in the evidence always comes with its interval', () => {
    const [d] = diagnose(SCENARIOS.find((s) => s.name === 'liste mal enrichie')!.facts)
    expect(d.evidence[0]).toMatch(/18 rebonds sur 200 envois \(9,0 %, intervalle à 95 %/)
  })
})

describe('thresholds hold at their boundary', () => {
  it('bounces: exactly 5 % does not alert, just above does', () => {
    expect(diagnose(buildFacts({ ageDays: 20, steps: [{ sent: 95, replies: 3, bounced: 5 }] })).map((d) => d.code)).not.toContain('rebonds_anormaux')
    expect(diagnose(buildFacts({ ageDays: 20, steps: [{ sent: 94, replies: 3, bounced: 6 }] })).map((d) => d.code)).toContain('rebonds_anormaux')
  })

  it('bounces: a high rate on too few sends is not a diagnosis', () => {
    expect(diagnose(buildFacts({ ageDays: 20, steps: [{ sent: 35, replies: 1, bounced: 5 }] })).map((d) => d.code)).not.toContain('rebonds_anormaux')
  })

  it('silence: 99 leads without reply is not yet a diagnosis, 100 is', () => {
    expect(diagnose(buildFacts({ ageDays: 20, steps: [{ sent: THRESHOLDS.silentMinContacted - 1 }] })).map((d) => d.code)).not.toContain('personne_ne_repond')
    expect(diagnose(buildFacts({ ageDays: 20, steps: [{ sent: THRESHOLDS.silentMinContacted }] })).map((d) => d.code)).toContain('personne_ne_repond')
  })

  it('silence: a campaign younger than a week is never judged silent', () => {
    expect(diagnose(buildFacts({ ageDays: THRESHOLDS.youngDays - 0.5, steps: [{ sent: 500 }] })).map((d) => d.code)).toEqual(['trop_jeune'])
  })

  it('a queue with nothing holding it is not a stalled campaign', () => {
    expect(diagnose(buildFacts({ ageDays: 20, steps: [{ sent: 120, replies: 4, queued: 15 }] }))).toEqual([])
  })
})

describe('dates are written for a reader', () => {
  it('in French, Paris time, never as ISO', () => {
    expect(frenchMoment('2026-10-18T23:45:00.000Z')).toBe('le lundi 19 octobre à 01:45')
    expect(frenchMoment('pas une date')).toBe('au prochain créneau')
  })
})
