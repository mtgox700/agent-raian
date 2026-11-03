/**
 * Dashboard Layout: Server Component
 *
 * Responsibilities:
 *  1. Auth gate: redirect unauthenticated users to /sign-in
 *  2. Onboarding gate: redirect users without a completed workspace to /onboarding
 *  3. Pass real workspace name + plan to the Sidebar
 *  4. Render the chrome (Sidebar + Topbar + Toaster)
 *
 * Gates and data come from GET /api/views/dashboard-shell (lib/views/dashboard-shell):
 * the layout only applies the redirect it answers, before the page renders.
 */

import { redirect } from 'next/navigation'
import { Toaster }  from 'sonner'
import { isSparx }  from '@/lib/brand'
import { Sidebar }  from '@/components/dashboard/Sidebar'
import { Topbar }   from '@/components/dashboard/Topbar'
import { AuthProviders } from '@/components/providers/AuthProviders'
import { loadView } from '@/lib/front/server-api'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ── Gates: sign-in (401), pending invitation, onboarding (GET /api/views/dashboard-shell)
  const shell = await loadView('views.dashboardShell', {})
  if (shell.state === 'redirect') redirect(shell.to)
  const { workspace, workspaces } = shell

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
          workspaces={workspaces}
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
