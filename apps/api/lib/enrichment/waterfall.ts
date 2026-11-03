/**
 * Phantera: Email enrichment waterfall.
 *
 * Chains multiple providers and stops at the first verified hit, so we maximize
 * match rate while only "paying" for the cheapest provider that succeeds
 * (pay-on-success). EU strategy order (docs/VEILLE_DATA_SIGNALS_INFRA.md):
 * Dropcontact (GDPR anchor) -> Cognism (EU premium/mobile) -> LeadMagic/Findymail
 * (cheap fillers). Apollo stays for sourcing; this resolves the email/phone.
 *
 * The orchestration is pure over an injected provider list, so it's fully
 * unit-testable. Provider adapters mock when their key is absent.
 */

export interface EnrichmentLead {
  firstName: string
  lastName: string
  company: string | null
  domain?: string | null
}

export interface EnrichmentResult {
  email: string
  verified: boolean
  confidence: number // 0-100
  source: string     // provider name
}

export interface EnrichmentProvider {
  name: string
  /** Whether this provider is configured (has a key). Unconfigured ones skip. */
  isConfigured(): boolean
  /** Returns a hit or null. Should not throw for "not found". */
  findEmail(lead: EnrichmentLead): Promise<EnrichmentResult | null>
  /** Approx cost per successful hit (any unit). Used to order the waterfall
   *  cheapest-first so pay-on-success bills the lowest provider that succeeds. */
  costPerHit?: number
}

/** Order providers cheapest-first (undefined cost sorts last). Stable. */
export function orderByCost(providers: EnrichmentProvider[]): EnrichmentProvider[] {
  return providers
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ca = a.p.costPerHit ?? Number.POSITIVE_INFINITY
      const cb = b.p.costPerHit ?? Number.POSITIVE_INFINITY
      return ca === cb ? a.i - b.i : ca - cb
    })
    .map(({ p }) => p)
}

export interface WaterfallOutcome {
  result: EnrichmentResult | null
  /** Providers actually tried, in order. */
  tried: string[]
  /** Whether we stopped on a verified hit. */
  verifiedHit: boolean
}

export interface WaterfallOptions {
  /** Accept an unverified hit if no verified one is found (default true). */
  acceptUnverified?: boolean
  /** Minimum confidence to accept a hit (default 0). */
  minConfidence?: number
}

/**
 * Runs the waterfall: tries configured providers in order, returns the first
 * VERIFIED hit immediately. If none verify, returns the best unverified hit seen
 * (when acceptUnverified). A provider that throws is skipped (logged by caller).
 */
export async function runWaterfall(
  lead: EnrichmentLead,
  providers: EnrichmentProvider[],
  opts: WaterfallOptions = {},
): Promise<WaterfallOutcome> {
  const acceptUnverified = opts.acceptUnverified ?? true
  const minConfidence = opts.minConfidence ?? 0

  const tried: string[] = []
  let best: EnrichmentResult | null = null

  for (const provider of providers) {
    if (!provider.isConfigured()) continue
    tried.push(provider.name)

    let hit: EnrichmentResult | null = null
    try {
      hit = await provider.findEmail(lead)
    } catch {
      continue // treat provider errors as "no result" and fall through
    }
    if (!hit || hit.confidence < minConfidence) continue

    if (hit.verified) {
      return { result: hit, tried, verifiedHit: true }
    }
    // Keep the highest-confidence unverified hit as a fallback.
    if (!best || hit.confidence > best.confidence) best = hit
  }

  if (best && acceptUnverified) {
    return { result: best, tried, verifiedHit: false }
  }
  return { result: null, tried, verifiedHit: false }
}
