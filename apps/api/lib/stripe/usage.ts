/**
 * Phantera: Usage-based billing (active contacts).
 *
 * The 2026 pricing model meters "active contacts" with a platform floor +
 * included credits + overage (docs/VEILLE_SDR_PRICING_MULTICANAL.md). This
 * reports usage to Stripe Billing Meters so overage is billed automatically.
 *
 * Env-gated (STRIPE_SECRET_KEY). Meter name via STRIPE_ACTIVE_CONTACTS_METER
 * (default "active_contacts"). Unit-tested with a mocked Stripe client.
 */

import { getStripe } from './client'

export function isUsageBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

function meterName(): string {
  return process.env.STRIPE_ACTIVE_CONTACTS_METER || 'active_contacts'
}

export interface ActiveContactUsage {
  stripeCustomerId: string
  /** Number of newly-active contacts to report (incremental). */
  count: number
  /** Optional event timestamp (unix seconds) for backfills. */
  timestamp?: number
}

/**
 * Reports incremental active-contact usage to Stripe. Returns true if an event
 * was sent, false if skipped (not configured / no customer / non-positive count).
 */
export async function reportActiveContactUsage(usage: ActiveContactUsage): Promise<boolean> {
  if (!isUsageBillingConfigured() || !usage.stripeCustomerId || usage.count <= 0) {
    return false
  }

  await getStripe().billing.meterEvents.create({
    event_name: meterName(),
    payload: {
      stripe_customer_id: usage.stripeCustomerId,
      value: String(Math.floor(usage.count)),
    },
    ...(usage.timestamp ? { timestamp: usage.timestamp } : {}),
  })

  return true
}
