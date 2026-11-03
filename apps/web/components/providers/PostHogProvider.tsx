'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { PostHog } from 'posthog-js'
import { hasAnalyticsConsent, onConsentChange } from '@/lib/analytics/consent'

export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com'

const AnalyticsClientContext = createContext<PostHog | null>(null)

/** The PostHog client once the visitor has consented, otherwise null. */
export function useAnalyticsClient(): PostHog | null {
  return useContext(AnalyticsClientContext)
}

// A refusal must leave no PostHog identifier behind on the device.
function clearPostHogStorage() {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('ph_') || key.startsWith('__ph_'))
      .forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Storage blocked: nothing was persisted either.
  }
}

/**
 * PostHog analytics provider: client-only, consent-gated.
 *
 * Nothing from PostHog is downloaded or sent until the visitor accepts
 * analytics in the cookie banner (CNIL: no tracker before consent). On
 * acceptance the SDK is loaded with a dynamic import, off the critical path;
 * on withdrawal capturing stops and the local PostHog state is cleared.
 *
 * The context provider is always mounted, so a consent change never remounts
 * the page underneath it. Session recording only runs inside the
 * authenticated app, surveys never.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<PostHog | null>(null)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    let unmounted = false
    let loaded: PostHog | null = null

    const load = () => {
      void import('posthog-js').then(({ default: posthog }) => {
        // Consent may have been withdrawn while the SDK was downloading.
        if (unmounted || !hasAnalyticsConsent()) return
        if (!posthog.__loaded) {
          const inApp = window.location.pathname.startsWith('/dashboard')
          posthog.init(key, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
            capture_pageview: false, // handled by PostHogPageView
            persistence: 'localStorage',
            disable_surveys: true,
            disable_session_recording: !inApp,
          })
        } else {
          // Accepted again after a refusal on the same page view.
          posthog.set_config({ disable_persistence: false })
          posthog.opt_in_capturing()
        }
        loaded = posthog
        setClient(posthog)
      })
    }

    // Returning visitor who already accepted: defer to idle so analytics never
    // competes with first paint / LCP.
    const hasIdle = typeof window.requestIdleCallback === 'function'
    let idleId: number | undefined
    const cancelIdle = () => {
      if (idleId === undefined) return
      if (hasIdle) window.cancelIdleCallback(idleId)
      else window.clearTimeout(idleId)
      idleId = undefined
    }

    if (hasAnalyticsConsent()) {
      idleId = hasIdle
        ? window.requestIdleCallback(load, { timeout: 4000 })
        : window.setTimeout(load, 2000)
    } else {
      // Identifiers left by earlier versions that loaded PostHog before consent.
      clearPostHogStorage()
    }

    const off = onConsentChange((state) => {
      if (state.analytics) {
        cancelIdle()
        load()
        return
      }
      cancelIdle()
      if (loaded) {
        loaded.opt_out_capturing()
        // Stop PostHog from writing its state back once we have cleared it.
        loaded.set_config({ disable_persistence: true })
        loaded.reset()
      }
      clearPostHogStorage()
      // The SDK may flush a last write asynchronously after reset().
      window.setTimeout(clearPostHogStorage, 500)
      setClient(null)
    })

    return () => {
      unmounted = true
      cancelIdle()
      off()
    }
  }, [])

  return (
    <AnalyticsClientContext.Provider value={client}>
      {children}
    </AnalyticsClientContext.Provider>
  )
}
