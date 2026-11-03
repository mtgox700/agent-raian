'use client'

/**
 * Clerk's session token lives 60 seconds and is refreshed by a timer the
 * browser slows down in a background tab. A call made right after waking up
 * reaches the API with an expired token and gets `401 session_expired`
 * (lib/security/signed-out). Here every same-origin /api call that gets it
 * asks Clerk for a fresh token (which rewrites the session cookie) and is
 * sent again once. A real sign-out still ends in the 401.
 */

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { retryOnExpiredSession } from '@/lib/security/session-refetch'

export function SessionRefetch() {
  const { getToken } = useAuth()
  useEffect(() => retryOnExpiredSession(window, () => getToken({ skipCache: true })), [getToken])
  return null
}
