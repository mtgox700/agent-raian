'use client'

import posthog from 'posthog-js'

/**
 * The analytics events of body n°1's Leads screen (lib/analytics/events),
 * same names and properties. No-op when PostHog is not initialised.
 */
type LeadsEvent =
  | ['first_search_launched', { limit: number; industry?: string }]
  | ['first_lead_saved', { source: 'apollo' | 'manual' | 'csv' }]
  | ['csv_exported', { leadsCount: number }]

export function track<E extends LeadsEvent>(event: E[0], properties: E[1]): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  try {
    posthog.capture(event, properties)
  } catch {
    /* never let analytics throw */
  }
}
