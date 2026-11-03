/**
 * Dashboard Layout: Server Component
 *
 * Responsibilities:
 *  1. Auth gate: redirect unauthenticated users to /sign-in
 *  2. Onboarding gate: redirect users without a completed workspace to /onboarding
 *  3. Pass real workspace name + plan to the Sidebar
 *  4. Render the chrome (Sidebar + Topbar + Toaster)
 *
 * Why server component?  Auth + DB checks happen at the edge before the
 * page renders: no client-side flash, no layout shift, no round-trip.
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { hasPendingInvite } from '@/lib/team/pending-invite'
import { Toaster }  from 'sonner'
import { db }       from '@/lib/db'
import { isSparx }  from '@/lib/brand'
import { Sidebar }  from '@/components/dashboard/Sidebar'
import { Topbar }   from '@/components/dashboard/Topbar'
import { AuthProviders } from '@/components/providers/AuthProviders'
import { loadAccess, listMyWorkspaces } from '@/lib/auth/access'
import { needsOnboarding } from '@/lib/auth/onboarding'
import { verifiedPrimaryEmail } from '@/lib/auth/verified-email'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Just signed in or up from an invitation: back to it before anything else.
  if (await hasPendingInvite()) redirect('/invite/resume')

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
    redirect('/sign-in')
  }

  // No DB user or no workspace yet (just signed up) -> complete onboarding first.
  // The workspace is the active one among the user's memberships.
  const access = user ? await loadAccess(userId) : null
  if (!access) redirect('/onboarding')

  const workspace = await db.workspace.findUnique({
    where:  { id: access.workspaceId },
    select: { id: true, name: true, plan: true, onboardingCompleted: true },
  })
  if (!workspace) redirect('/onboarding')

  // Workspace exists but onboarding was never finished: only those who can
  // finish it (owner, admin) are sent there; the onboarding layout makes the
  // same choice, so the two never bounce a user back and forth.
  if (!workspace.onboardingCompleted && needsOnboarding(access.role)) {
    redirect('/onboarding')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AuthProviders>
      {/* data-app-shell switches the Spar-x colour engine to the dark-teal
          dashboard scheme (see globals.css); inert for Phantera. */}
      <div data-app-shell className="flex h-screen overflow-hidden bg-void">
        <Sidebar
          workspaceName={workspace.name}
          plan={workspace.plan}
          workspaceId={workspace.id}
          workspaces={await listMyWorkspaces(userId).catch(() => [])}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />

          <main className="flex-1 overflow-auto bg-void">
            {children}
          </main>
        </div>

        {/* Global toast notifications (sonner) — brand-themed (dark for
            Phantera, light editorial for Spar-x; exact legacy values kept
            for Phantera). */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: isSparx
              ? {
                  // Dark-teal app shell (matches data-app-shell scheme)
                  background:   '#112527',
                  border:       '1px solid rgba(242,247,246,0.10)',
                  color:        '#F2F7F6',
                  borderRadius: '12px',
                  fontSize:     '13px',
                }
              : {
                  background:   '#0f1117',
                  border:       '1px solid rgba(var(--fg-rgb),0.08)',
                  color:        '#f1f5f9',
                  borderRadius: '12px',
                  fontSize:     '13px',
                },
            className: 'shadow-2xl',
          }}
          richColors
          closeButton
        />
      </div>
    </AuthProviders>
  )
}
