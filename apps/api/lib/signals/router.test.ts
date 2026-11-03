import { describe, it, expect } from 'vitest'
import { routeSignal, prioritizeSignals, type SignalEvent } from './router'

describe('routeSignal', () => {
  it('routes funding to the congrats playbook, EU-safe', () => {
    const r = routeSignal({ type: 'FUNDING', company: 'ACME' })
    expect(r.playbook).toBe('funding-congrats')
    expect(r.priority).toBe('HIGH')
    expect(r.euStatus).toBe('SAFE')
    expect(r.euActionable).toBe(true)
  })

  it('routes job change as CRITICAL but NEEDS_DPA', () => {
    const r = routeSignal({ type: 'JOB_CHANGE', country: 'France' })
    expect(r.priority).toBe('CRITICAL')
    expect(r.euStatus).toBe('NEEDS_DPA')
    expect(r.euActionable).toBe(true) // allowed with downstream LIA
  })

  it('blocks person-level web de-anon in the EU', () => {
    const eu = routeSignal({ type: 'WEBSITE_VISIT_PERSON', country: 'France' })
    expect(eu.euStatus).toBe('NOT_EU_LEGAL')
    expect(eu.euActionable).toBe(false)
  })

  it('allows person-level web de-anon outside the EU (US)', () => {
    const us = routeSignal({ type: 'WEBSITE_VISIT_PERSON', country: 'US' })
    expect(us.euActionable).toBe(true)
  })

  it('defaults to the stricter regime when country is unknown', () => {
    const r = routeSignal({ type: 'WEBSITE_VISIT_PERSON' })
    expect(r.euActionable).toBe(false)
  })
})

describe('prioritizeSignals', () => {
  it('sorts by priority and drops EU-blocked signals', () => {
    const signals: SignalEvent[] = [
      { type: 'TECHNOGRAPHIC', country: 'France' },          // MEDIUM
      { type: 'JOB_CHANGE', country: 'France' },             // CRITICAL
      { type: 'WEBSITE_VISIT_PERSON', country: 'France' },   // blocked in EU
      { type: 'FUNDING', country: 'France' },                // HIGH
    ]
    const routed = prioritizeSignals(signals)
    expect(routed.map((r) => r.type)).toEqual(['JOB_CHANGE', 'FUNDING', 'TECHNOGRAPHIC'])
  })

  it('keeps the US person-level signal in the queue', () => {
    const routed = prioritizeSignals([{ type: 'WEBSITE_VISIT_PERSON', country: 'US' }])
    expect(routed).toHaveLength(1)
  })
})
