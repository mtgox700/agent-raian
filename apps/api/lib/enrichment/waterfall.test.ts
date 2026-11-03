import { describe, it, expect, vi } from 'vitest'
import { runWaterfall, type EnrichmentProvider, type EnrichmentResult, type EnrichmentLead } from './waterfall'

const lead: EnrichmentLead = { firstName: 'Jean', lastName: 'Dupont', company: 'ACME', domain: 'acme.com' }

function provider(
  name: string,
  result: EnrichmentResult | null,
  opts: { configured?: boolean; throws?: boolean } = {},
): EnrichmentProvider {
  return {
    name,
    isConfigured: () => opts.configured ?? true,
    findEmail: vi.fn(async () => {
      if (opts.throws) throw new Error('boom')
      return result
    }),
  }
}

const verified = (source: string, confidence = 90): EnrichmentResult => ({
  email: `${source}@acme.com`, verified: true, confidence, source,
})
const unverified = (source: string, confidence: number): EnrichmentResult => ({
  email: `${source}@acme.com`, verified: false, confidence, source,
})

describe('runWaterfall', () => {
  it('returns the first verified hit and stops', async () => {
    const p1 = provider('dropcontact', null)
    const p2 = provider('cognism', verified('cognism'))
    const p3 = provider('findymail', verified('findymail'))

    const out = await runWaterfall(lead, [p1, p2, p3])

    expect(out.result?.source).toBe('cognism')
    expect(out.verifiedHit).toBe(true)
    expect(out.tried).toEqual(['dropcontact', 'cognism']) // stopped before p3
    expect(p3.findEmail).not.toHaveBeenCalled()
  })

  it('skips unconfigured providers', async () => {
    const p1 = provider('dropcontact', verified('dropcontact'), { configured: false })
    const p2 = provider('cognism', verified('cognism'))

    const out = await runWaterfall(lead, [p1, p2])

    expect(out.tried).toEqual(['cognism'])
    expect(p1.findEmail).not.toHaveBeenCalled()
  })

  it('falls through on provider errors', async () => {
    const p1 = provider('dropcontact', null, { throws: true })
    const p2 = provider('cognism', verified('cognism'))

    const out = await runWaterfall(lead, [p1, p2])

    expect(out.result?.source).toBe('cognism')
    expect(out.tried).toEqual(['dropcontact', 'cognism'])
  })

  it('returns the best unverified hit when none verify', async () => {
    const p1 = provider('a', unverified('a', 40))
    const p2 = provider('b', unverified('b', 70))

    const out = await runWaterfall(lead, [p1, p2])

    expect(out.result?.source).toBe('b') // highest confidence
    expect(out.verifiedHit).toBe(false)
  })

  it('returns null when acceptUnverified is false and nothing verifies', async () => {
    const p1 = provider('a', unverified('a', 80))
    const out = await runWaterfall(lead, [p1], { acceptUnverified: false })
    expect(out.result).toBeNull()
  })

  it('respects minConfidence', async () => {
    const p1 = provider('a', verified('a', 30))
    const p2 = provider('b', verified('b', 95))
    const out = await runWaterfall(lead, [p1, p2], { minConfidence: 50 })
    expect(out.result?.source).toBe('b')
  })
})
