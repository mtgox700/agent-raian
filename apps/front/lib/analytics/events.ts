/**
 * Centralised analytics event taxonomy.
 *
 * Why a single file:
 *   • One source of truth for the funnel: prevents typos, drift, duplicate event names
 *   • Type-safe properties per event
 *   • Easy to swap PostHog for another provider later
 *
 * Event categories follow AARRR (Pirate Metrics):
 *   ACQUISITION: first contact with the brand
 *   ACTIVATION: user reaches aha moment
 *   RETENTION: repeat engagement
 *   REVENUE: monetisation events
 *   REFERRAL: viral mechanics (future)
 */

'use client'

import posthog from 'posthog-js'

// ─── Event names (typed) ──────────────────────────────────────────────────────

export type PhanteraEvent =
  // Acquisition
  | 'landing_viewed'
  | 'pricing_viewed'
  | 'signup_clicked'
  // Activation
  | 'signup_completed'
  | 'onboarding_completed'
  | 'first_search_launched'
  | 'first_lead_saved'
  | 'first_value_reached'
  | 'first_campaign_created'
  | 'campaign_created'
  | 'first_email_sent'
  | 'first_reply_received'
  // Revenue
  | 'checkout_started'
  | 'checkout_completed'
  | 'subscription_cancelled'
  // Retention
  | 'csv_exported'
  | 'campaign_launched'
  | 'inbox_reply_opened'
  | 'inbox_reply_responded'

// ─── Property maps (event -> properties shape) ────────────────────────────────

interface EventPropertyMap {
  landing_viewed:           { variant?: string }
  pricing_viewed:           { source?: string }
  signup_clicked:           { source?: 'hero' | 'pricing' | 'nav' | 'footer' | 'about' }
  signup_completed:         { method: 'email' | 'google' | 'github' }
  onboarding_completed:     { industry?: string; companySize?: string }
  first_search_launched:    { limit: number; industry?: string }
  first_lead_saved:         { source: 'apollo' | 'manual' | 'csv' }
  // The pivot activation metric: first scored lead visible to a new user.
  // `secondsToValue` = time from onboarding completion to first scored lead.
  first_value_reached:      { secondsToValue: number; leadsScored: number }
  first_campaign_created:   { goal: string }
  campaign_created:         { goal: string }
  first_email_sent:         { campaignId: string }
  first_reply_received:     { classification: string }
  checkout_started:         { plan: 'PRO' | 'BUSINESS' | 'ENTERPRISE'; billing: 'monthly' | 'annual' }
  checkout_completed:       { plan: 'PRO' | 'BUSINESS' | 'ENTERPRISE'; amount: number }
  subscription_cancelled:   { previousPlan: string }
  csv_exported:             { leadsCount: number }
  campaign_launched:        { campaignId: string; leadsCount: number }
  inbox_reply_opened:       { classification: string; confidence: number }
  inbox_reply_responded:    { classification: string }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Capture an event with type-checked properties.
 * No-op when PostHog is not initialised or user opted out.
 */
export function track<E extends PhanteraEvent>(
  event: E,
  properties?: EventPropertyMap[E],
): void {
  if (typeof window === 'undefined') return
  if (!posthog.__loaded) return
  try {
    posthog.capture(event, properties as Record<string, unknown> | undefined)
  } catch {
    /* never let analytics throw */
  }
}

/**
 * Identify the current user (call once after sign-in).
 */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  try {
    posthog.identify(userId, traits)
  } catch {
    /* swallow */
  }
}

/**
 * Reset analytics state on sign-out.
 */
export function resetAnalytics(): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  try {
    posthog.reset()
  } catch {
    /* swallow */
  }
}
