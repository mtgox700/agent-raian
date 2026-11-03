/**
 * Server-side analytics: PostHog Node SDK.
 *
 * Mirrors the client-side taxonomy in `events.ts` so the funnel is consistent
 * regardless of where an event originates. Server events fire from:
 *   • Webhook handlers (Clerk, Stripe, Resend, inbound-email)
 *   • Server actions (onboarding, manual lead creation)
 *   • Cron jobs (process-sequences first email per campaign)
 *
 * Design rules:
 *   1. Fire-and-forget: never let analytics block a request.
 *   2. Singleton PostHog client: reuses connection across invocations.
 *   3. Graceful no-op when `POSTHOG_API_KEY` is missing (dev/CI).
 *   4. `distinctId` must match the same id PostHog uses on the client
 *      (Clerk userId) so server + client events live on the same person.
 */

import { PostHog } from 'posthog-node'

// ─── Event taxonomy: kept in sync with client-side events.ts ────────────────

export type ServerEvent =
  | 'signup_completed'
  | 'onboarding_completed'
  | 'first_lead_saved'
  | 'first_campaign_created'
  | 'first_email_sent'
  | 'first_reply_received'
  | 'checkout_completed'
  | 'subscription_cancelled'

interface ServerEventPropertyMap {
  signup_completed:       { method?: 'email' | 'google' | 'github'; clerkId?: string }
  onboarding_completed:   { workspaceId: string; industry?: string; companySize?: string }
  first_lead_saved:       { workspaceId: string; source: 'apollo' | 'manual' | 'csv' }
  first_campaign_created: { workspaceId: string; campaignId: string; goal?: string }
  first_email_sent:       { workspaceId: string; campaignId: string; sendId?: string }
  first_reply_received:   { workspaceId: string; campaignId: string; leadId: string; classification: string }
  checkout_completed:     { workspaceId: string; plan: 'PRO' | 'BUSINESS' | 'ENTERPRISE'; amount?: number }
  subscription_cancelled: { workspaceId: string; previousPlan: string }
}

// ─── Singleton client ────────────────────────────────────────────────────────

let client: PostHog | null = null
let clientInitialised = false

function getClient(): PostHog | null {
  if (clientInitialised) return client

  const key  = process.env.POSTHOG_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.POSTHOG_HOST    ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

  if (!key) {
    clientInitialised = true
    return null
  }

  client = new PostHog(key, {
    host,
    // Flush every 20 events or 10s: server-friendly batching
    flushAt:       20,
    flushInterval: 10_000,
  })
  clientInitialised = true
  return client
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Capture a server-side event tied to a specific user (Clerk userId).
 * Returns immediately; the network call happens in the background.
 *
 * Never throws: analytics should never break the parent request.
 */
export function trackServer<E extends ServerEvent>(
  distinctId: string,
  event:      E,
  properties?: ServerEventPropertyMap[E],
): void {
  const ph = getClient()
  if (!ph) return

  try {
    ph.capture({
      distinctId,
      event,
      properties: properties as Record<string, unknown> | undefined,
    })
  } catch {
    // Never throw from analytics
  }
}

/**
 * Flush pending events. Call this at the end of webhook handlers / server
 * actions when you want to ensure delivery before the function returns.
 *
 * In Vercel serverless, the runtime kills idle Node when the response is
 * sent: so explicit flush is the safest pattern for low-volume hooks.
 */
export async function flushServerEvents(): Promise<void> {
  const ph = getClient()
  if (!ph) return
  try {
    await ph.shutdown()
    client            = null
    clientInitialised = false
  } catch {
    // Best-effort; do not surface to caller
  }
}
