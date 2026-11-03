/**
 * Analytics consent (CNIL / ePrivacy): no analytics tracker may load before an
 * explicit acceptance. This module is the single source of truth for that
 * decision; the PostHog provider and the cookie banner both go through it.
 *
 * Persisted shape under `phantera.consent`: { analytics: boolean, decidedAt: ISO }.
 * A decision is valid 12 months, then the banner asks again.
 */

export const CONSENT_STORAGE_KEY = 'phantera.consent'
export const CONSENT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000

const CHANGE_EVENT = 'phantera:consent-change'
const OPEN_EVENT   = 'phantera:consent-open'

export interface ConsentState {
  analytics: boolean
  decidedAt: string
}

export function parseConsent(raw: string | null, now: number): ConsentState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>
    if (typeof parsed.analytics !== 'boolean' || typeof parsed.decidedAt !== 'string') return null
    const decidedAt = Date.parse(parsed.decidedAt)
    if (Number.isNaN(decidedAt) || now - decidedAt > CONSENT_VALIDITY_MS) return null
    return { analytics: parsed.analytics, decidedAt: parsed.decidedAt }
  } catch {
    return null
  }
}

export function readConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY), Date.now())
  } catch {
    return null
  }
}

export function hasAnalyticsConsent(): boolean {
  return readConsent()?.analytics === true
}

export function writeConsent(analytics: boolean): void {
  if (typeof window === 'undefined') return
  const state: ConsentState = { analytics, decidedAt: new Date().toISOString() }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage blocked: the choice still applies to the current page view.
  }
  window.dispatchEvent(new CustomEvent<ConsentState>(CHANGE_EVENT, { detail: state }))
}

export function onConsentChange(listener: (state: ConsentState) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ConsentState>).detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

export function requestConsentDialog(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function onConsentDialogRequest(listener: () => void): () => void {
  window.addEventListener(OPEN_EVENT, listener)
  return () => window.removeEventListener(OPEN_EVENT, listener)
}
