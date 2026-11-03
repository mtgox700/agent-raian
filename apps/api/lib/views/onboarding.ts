/**
 * Onboarding guard ((auth)/onboarding/layout.tsx), served by GET /api/views/onboarding.
 *
 * /onboarding must ONLY ever render for a user without a completed workspace.
 * Without this guard, any flow that lands here directly (e.g. an existing user
 * signing in through the sign-UP page -> signUpForceRedirectUrl) shows the
 * workspace form again: founder-reported bug (2026-07-10).
 *
 * Includes the same Clerk dev ->prod email re-link as the dashboard shell: a
 * user whose DB row carries an old-instance clerkId is repaired here too, so
 * BOTH entry points (/dashboard and /onboarding) are self-healing.
 */

import type { PrismaClient } from '@prisma/client'
import { currentUser } from '@clerk/nextjs/server'
import { hasPendingInvite } from '@/lib/team/pending-invite'
import { loadAccess } from '@/lib/auth/access'
import { needsOnboarding } from '@/lib/auth/onboarding'
import { verifiedPrimaryEmail } from '@/lib/auth/verified-email'

export type OnboardingView = { state: 'ready' } | { state: 'redirect'; to: string }

export async function onboardingView(db: PrismaClient, userId: string): Promise<OnboardingView> {
  // Just signed in or up from an invitation: back to it before anything else.
  if (await hasPendingInvite()) return { state: 'redirect', to: '/api/invitations/resume' }

  const completedSelect = { id: true } as const

  let user = null
  try {
    user = await db.user.findUnique({
      where:  { clerkId: userId },
      select: completedSelect,
    })

    // Clerk-instance migration repair (same as lib/views/dashboard-shell.ts):
    // unknown clerkId + known email -> re-link once, then evaluate normally.
    if (!user) {
      const cu = await currentUser()
      // Verified primary address only: an unverified one could be anyone's.
      const email = verifiedPrimaryEmail(cu)
      if (email) {
        const byEmail = await db.user.findUnique({ where: { email } })
        if (byEmail) {
          await db.user.update({ where: { id: byEmail.id }, data: { clerkId: userId } })
          user = await db.user.findUnique({
            where:  { clerkId: userId },
            select: completedSelect,
          })
        }
      }
    }
  } catch {
    // DB hiccup: let the onboarding page render rather than hard-failing;
    // completing it is idempotent (upserts) so no harm done.
    user = null
  }

  // Already onboarded -> this page has nothing to ask. Straight to the app.
  // Same choice as the dashboard shell: the active workspace, and whether
  // this user is the one who should finish its set-up.
  const access = user ? await loadAccess(userId) : null
  if (access) {
    const active = await db.workspace.findUnique({ where: { id: access.workspaceId }, select: { onboardingCompleted: true } })
    if (active?.onboardingCompleted || !needsOnboarding(access.role)) return { state: 'redirect', to: '/dashboard' }
  }

  return { state: 'ready' }
}
