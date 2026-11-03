'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useAnalyticsClient } from '@/components/providers/PostHogProvider'

/** Captures a $pageview event on every route change in App Router */
export function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = useAnalyticsClient()

  useEffect(() => {
    if (!pathname || !posthog) return

    let url = pathname
    if (searchParams?.toString()) {
      url += `?${searchParams.toString()}`
    }

    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, posthog])

  return null
}
