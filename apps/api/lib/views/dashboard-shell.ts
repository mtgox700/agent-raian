/**
 * Gate and chrome data of the dashboard layout ((dashboard)/layout.tsx),
 * served by GET /api/views/dashboard-shell.
 *
 *  1. Pending invitation: back to it before anything else.
 *  2. Workspace + onboarding check (with the Clerk-instance migration repair).
 *  3. Real workspace name + plan + the user's workspaces for the Sidebar.
 */

import type { PrismaClient, Plan, WorkspaceRole } from '@prisma/client'
import { currentUser } from '@clerk/nextjs/server'
import { hasPendingInvite } from '@/lib/team/pending-invite'
import { loadAccess, listMyWorkspaces } from '@/lib/auth/access'
import { needsOnboarding } from '@/lib/auth/onboarding'
import { verifiedPrimaryEmail } from '@/lib/auth/verified-email'

export type DashboardShellView =
  | { state: 'redirect'; to: string }
  | {
      state: 'ready'
      workspace: { id: string; name: string; plan: Plan }
      workspaces: Array<{ workspaceId: string; name: string; role: WorkspaceRole }>
    }

export async function dashboardShellView(db: PrismaClient, userId: string): Promise<DashboardShellView> {
  // Just signed in or up from an invitation: back to it before anything else.
  if (await hasPendingInvite()) return { state: 'redirect', to: '/api/invitations/resume' }

  // ── Workspace + onboarding check ─────────────────────────────────────────
  const workspaceSelect = { id: true } as const

  let user
  try {
    user = await db.user.findUnique({
      where:  { clerkId: userId },
      select: workspaceSelect,
    })

    // ── Clerk-instance migration repair ────────────────────────────────────
    // After the dev ->prod Clerk switch, existing DB users carry the OLD
    // instance's clerkId; the new instance issues fresh ids, so the lookup
    // above misses and the user is wrongly sent back to onboarding on every
    // login. Recover by email: if a DB user matches the signed-in email,
    // re-link it to the new clerkId once and continue normally.
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
            select: workspaceSelect,
          })
        }
      }
    }
  } catch {
    // DB temporarily unavailable: fall back to sign-in to avoid a broken layout
    return { state: 'redirect', to: '/sign-in' }
  }

  // No DB user or no workspace yet (just signed up) -> complete onboarding first.
  // The workspace is the active one among the user's memberships.
  const access = user ? await loadAccess(userId) : null
  if (!access) return { state: 'redirect', to: '/onboarding' }

  const workspace = await db.workspace.findUnique({
    where:  { id: access.workspaceId },
    select: { id: true, name: true, plan: true, onboardingCompleted: true },
  })
  if (!workspace) return { state: 'redirect', to: '/onboarding' }

  // Workspace exists but onboarding was never finished: only those who can
  // finish it (owner, admin) are sent there; the onboarding layout makes the
  // same choice, so the two never bounce a user back and forth.
  if (!workspace.onboardingCompleted && needsOnboarding(access.role)) {
    return { state: 'redirect', to: '/onboarding' }
  }

  return {
    state: 'ready',
    workspace: { id: workspace.id, name: workspace.name, plan: workspace.plan },
    workspaces: await listMyWorkspaces(userId).catch(() => []),
  }
}
