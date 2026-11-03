import { describe, it, expect, vi } from 'vitest'
import { leadCacheKey, InMemoryEnrichmentCache, runWaterfallCached } from './cache'
import { orderByCost, type EnrichmentProvider, type EnrichmentResult, type EnrichmentLead } from './waterfall'

const lead: EnrichmentLead = { firstName: 'Jean', lastName: 'Dupont', company: 'ACME', domain: 'acme.com' }
const hit: EnrichmentResult = { email: 'jean@acme.com', verified: true, confidence: 90, source: 'p' }

function provider(name: string, result: EnrichmentResult | null, cost?: number): EnrichmentProvider {
  return { name, isConfigured: () => true, findEmail: vi.fn(async () => result), costPerHit: cost }
}

describe('leadCacheKey', () => {
  it('is stable and normalized', () => {
    expect(leadCacheKey(lead)).toBe('enrich:jean:dupont:acme.com')
    expect(leadCacheKey({ ...lead, firstName: ' JEAN ' })).toBe('enrich:jean:dupont:acme.com')
  })
})

describe('orderByCost', () => {
  it('sorts cheapest-first, undefined cost last, stable on ties', () => {
    const a = provider('a', hit, 0.05)
    const b = provider('b', hit, 0.01)
    const c = provider('c', hit) // no cost → last
    const d = provider('d', hit, 0.01)
    expect(orderByCost([a, b, c, d]).map((p) => p.name)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('runWaterfallCached', () => {
  it('runs providers on a miss and caches the hit', async () => {
    const cache = new InMemoryEnrichmentCache()
    const p = provider('p', hit)
    const out = await runWaterfallCached(lead, [p], cache)
    expect(out.cached).toBe(false)
    expect(out.result?.email).toBe('jean@acme.com')
    expect(p.findEmail).toHaveBeenCalledTimes(1)
  })

  it('returns the cached hit without calling providers again', async () => {
    const cache = new InMemoryEnrichmentCache()
    const p = provider('p', hit)
    await runWaterfallCached(lead, [p], cache)
    const second = await runWaterfallCached(lead, [p], cache)
    expect(second.cached).toBe(true)
    expect(second.result?.email).toBe('jean@acme.com')
    expect(p.findEmail).toHaveBeenCalledTimes(1) // not called again
  })

  it('negative-caches a miss (no re-pay for known-misses)', async () => {
    const cache = new InMemoryEnrichmentCache()
    const p = provider('p', null)
    await runWaterfallCached(lead, [p], cache)
    const second = await runWaterfallCached(lead, [p], cache)
    expect(second.cached).toBe(true)
    expect(second.result).toBeNull()
    expect(p.findEmail).toHaveBeenCalledTimes(1)
  })

  it('expires cache entries after TTL', async () => {
    let t = 1000
    const cache = new InMemoryEnrichmentCache(() => t)
    const p = provider('p', hit)
    await runWaterfallCached(lead, [p], cache, { hitTtlMs: 500 })
    t = 2000
    const second = await runWaterfallCached(lead, [p], cache, { hitTtlMs: 500 })
    expect(second.cached).toBe(false) // expired → re-ran
    expect(p.findEmail).toHaveBeenCalledTimes(2)
  })
})
