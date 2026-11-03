'use client'

/**
 * The sign-in form, unless the browser already holds a session. That
 * happens when a session expired on the server and clerk-js refreshed it on
 * this page: Clerk's form then sends the person to the provider's default
 * (/dashboard), whatever redirect_url says. Here they go back to the page
 * they asked for instead (`to`, already checked: this site only).
 *
 * Once only: if the server still sees no session, the page asked for sends
 * back here, and the form takes over rather than looping.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'

const GUARD_KEY = 'phantera.signin.return'
const GUARD_MS = 15_000

function recentlyTried(): boolean {
  try {
    const at = Number(sessionStorage.getItem(GUARD_KEY))
    return Number.isFinite(at) && Date.now() - at < GUARD_MS
  } catch {
    return false
  }
}

export function SignInGate({ to, children }: { to: string; children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || recentlyTried()) return
    try { sessionStorage.setItem(GUARD_KEY, String(Date.now())) } catch { /* private mode: the guard is best effort */ }
    setLeaving(true)
    window.location.replace(to)
  }, [isLoaded, isSignedIn, to])

  // The form is mounted only once Clerk knows there is no session: mounted
  // earlier, it would race this redirect with its own.
  if (!isLoaded) return <div className="h-[420px] w-full max-w-md animate-pulse rounded-2xl bg-surface" aria-hidden="true" />
  if (leaving || (isSignedIn && !recentlyTried())) {
    return <p role="status" className="text-sm text-quiet">Session retrouvée, retour à votre page.</p>
  }
  return <>{children}</>
}
