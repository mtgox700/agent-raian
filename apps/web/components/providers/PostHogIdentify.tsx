'use client'

/**
 * PostHogIdentify
 *
 * Bridges Clerk authentication -> PostHog person identification.
 *
 * - On sign-in  : posthog.identify(clerkUserId, { email, name, plan })
 * - On sign-out : posthog.reset(): clears the anonymous ↔ identified link
 *
 * Must be rendered inside both <ClerkProvider> and <PostHogProvider>; does
 * nothing until the visitor has consented to analytics.
 */

import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useAnalyticsClient } from '@/components/providers/PostHogProvider'

export function PostHogIdentify() {
  const { user, isLoaded } = useUser()
  const posthog = useAnalyticsClient()

  useEffect(() => {
    if (!isLoaded || !posthog) return

    if (user) {
      const email     = user.primaryEmailAddress?.emailAddress ?? ''
      const firstName = user.firstName ?? ''
      const lastName  = user.lastName  ?? ''
      const name      = [firstName, lastName].filter(Boolean).join(' ')

      posthog.identify(user.id, {
        email,
        name,
        firstName,
        lastName,
        // Add plan from publicMetadata if Stripe sync is set up
        plan: (user.publicMetadata?.plan as string | undefined) ?? 'FREE',
      })
    } else {
      // User signed out: reset so next session starts clean
      posthog.reset()
    }
  }, [isLoaded, user, posthog])

  return null
}
