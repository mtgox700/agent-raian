/**
 * Batch email enrichment over the provider waterfall.
 *
 * Runs runWaterfall() for many leads with bounded concurrency and an optional
 * wall-clock deadline so the whole step fits inside Vercel's function budget
 * (Hobby = 60s). Providers are ordered cheapest-first (pay-on-success), so we
 * only "pay" the lowest-cost provider that returns a verified hit: and we never
 * depend on a single source (Apollo credits running out no longer means 0 leads).
 */

import { runWaterfall, orderByCost, type EnrichmentLead } from './waterfall'
import { configuredProviders } from './providers'

export interface BatchEnrichResult {
  email:      string | null
  verified:   boolean
  confidence: number
  source:     string | null
}

const EMPTY: BatchEnrichResult = { email: null, verified: false, confidence: 0, source: null }

export function hasConfiguredProviders(): boolean {
  return configuredProviders().length > 0
}

export async function enrichEmailsWaterfall(
  leads: EnrichmentLead[],
  opts: { concurrency?: number; deadlineMs?: number } = {},
): Promise<BatchEnrichResult[]> {
  const providers = orderByCost(configuredProviders())
  if (providers.length === 0) return leads.map(() => ({ ...EMPTY }))

  const concurrency = Math.max(1, opts.concurrency ?? 5)
  const deadline    = opts.deadlineMs ? Date.now() + opts.deadlineMs : null
  const results: BatchEnrichResult[] = new Array(leads.length).fill(null).map(() => ({ ...EMPTY }))

  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < leads.length) {
      const i = cursor++
      // Stop spending time once the deadline passes: remaining leads stay EMPTY
      // so the caller can still save everything found before the cutoff.
      if (deadline && Date.now() > deadline) continue
      try {
        const { result } = await runWaterfall(leads[i]!, providers)
        if (result) {
          results[i] = {
            email:      result.email,
            verified:   result.verified,
            confidence: result.confidence,
            source:     result.source,
          }
        }
      } catch {
        // provider/network error → leave EMPTY, keep going
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, leads.length) }, () => worker()),
  )
  return results
}
