/**
 * Onboarding guard: server-side (logic in lib/views/onboarding, served by
 * GET /api/views/onboarding).
 *
 * /onboarding must ONLY ever render for a user without a completed workspace.
 * Without this guard, any flow that lands here directly (e.g. an existing user
 * signing in through the sign-UP page -> signUpForceRedirectUrl) shows the
 * workspace form again: founder-reported bug (2026-07-10).
 *
 * Includes the same Clerk dev ->prod email re-link as the dashboard layout: a
 * user whose DB row carries an old-instance clerkId is repaired here too, so
 * BOTH entry points (/dashboard and /onboarding) are self-healing.
 */
import { redirect } from 'next/navigation'
import { loadView } from '@/lib/front/server-api'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Sign-in (401), pending invitation, already onboarded: GET /api/views/onboarding.
  const gate = await loadView('views.onboarding', {})
  if (gate.state === 'redirect') redirect(gate.to)

  return <>{children}</>
}
