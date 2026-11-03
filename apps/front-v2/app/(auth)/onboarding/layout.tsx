import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * /onboarding renders ONLY for a user without a completed workspace (body
 * n°1's guard): GET /api/views/onboarding sends the others away (sign-in on
 * 401, pending invitation, dashboard when already onboarded).
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const gate = await loadView('views.onboarding', {})
  if (gate.state === 'redirect') redirect(gate.to)
  return <>{children}</>
}
