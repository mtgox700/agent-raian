import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app/AppShell'
import { AuthProviders } from '@/components/providers/AuthProviders'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Signed-in gate and chrome, as in body n°1. GET /api/views/dashboard-shell
 * answers where to send the visitor (sign-in on 401, pending invitation,
 * onboarding) or the active workspace and the user's workspaces; the layout
 * only applies its redirect, before the page renders.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const shell = await loadView('views.dashboardShell', {})
  if (shell.state === 'redirect') redirect(shell.to)
  const { workspace, workspaces } = shell

  return (
    <AuthProviders>
      <AppShell workspaceName={workspace.name} plan={workspace.plan} workspaceId={workspace.id} workspaces={workspaces}>
        {children}
      </AppShell>
    </AuthProviders>
  )
}
