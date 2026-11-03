/**
 * Phantera: Enrichment cache.
 *
 * Enrichment is the real COGS driver (not the LLM): so we must never re-enrich
 * the same lead. This caches BOTH hits and known-misses (negative caching) so a
 * second lookup of an already-resolved (or already-failed) lead costs nothing.
 *
 * Pure key + interface + in-memory impl (injectable clock, TTL). A Redis impl
 * (Upstash) slots behind the same interface for cross-instance caching.
 */

import { runWaterfall, type EnrichmentLead, type EnrichmentProvider, type EnrichmentResult, type WaterfallOptions, type WaterfallOutcome } from './waterfall'

/** Stable cache key from the identity-bearing fields. */
export function leadCacheKey(lead: EnrichmentLead): string {
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
  return ['enrich', norm(lead.firstName), norm(lead.lastName), norm(lead.domain || lead.company)].join(':')
}

export interface CacheLookup {
  hit: boolean
  /** The cached value: a result, or null for a cached known-miss. */
  value: EnrichmentResult | null
}

export interface EnrichmentCache {
  get(key: string): Promise<CacheLookup>
  /** Store a hit (result) or a known-miss (null). */
  set(key: string, value: EnrichmentResult | null, ttlMs?: number): Promise<void>
}

interface Entry { value: EnrichmentResult | null; expiry: number | null }

export class InMemoryEnrichmentCache implements EnrichmentCache {
  private readonly store = new Map<string, Entry>()
  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<CacheLookup> {
    const e = this.store.get(key)
    if (!e) return { hit: false, value: null }
    if (e.expiry !== null && e.expiry <= this.now()) {
      this.store.delete(key)
      return { hit: false, value: null }
    }
    return { hit: true, value: e.value }
  }

  async set(key: string, value: EnrichmentResult | null, ttlMs?: number): Promise<void> {
    this.store.set(key, { value, expiry: ttlMs && ttlMs > 0 ? this.now() + ttlMs : null })
  }
}

export interface CachedWaterfallOptions extends WaterfallOptions {
  /** TTL for positive hits (default 30 days). */
  hitTtlMs?: number
  /** TTL for negative (known-miss) entries (default 7 days). */
  missTtlMs?: number
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Cache-aware waterfall: returns the cached value on hit (zero provider cost),
 * otherwise runs the waterfall and caches the outcome (hit or miss).
 */
export async function runWaterfallCached(
  lead: EnrichmentLead,
  providers: EnrichmentProvider[],
  cache: EnrichmentCache,
  opts: CachedWaterfallOptions = {},
): Promise<WaterfallOutcome & { cached: boolean }> {
  const key = leadCacheKey(lead)
  const cached = await cache.get(key)
  if (cached.hit) {
    return { result: cached.value, tried: [], verifiedHit: !!cached.value?.verified, cached: true }
  }

  const outcome = await runWaterfall(lead, providers, opts)
  const ttl = outcome.result ? (opts.hitTtlMs ?? 30 * DAY) : (opts.missTtlMs ?? 7 * DAY)
  await cache.set(key, outcome.result, ttl)
  return { ...outcome, cached: false }
}
