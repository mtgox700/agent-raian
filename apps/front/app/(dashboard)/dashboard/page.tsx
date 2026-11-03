import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CommandCenter } from '@/components/dashboard/CommandCenter'
import { loadView } from '@/lib/front/server-api'

/** /dashboard: the command center (data: GET /api/views/dashboard). */
export default async function DashboardPage() {
  const view = await loadView('views.dashboard', {})
  if ('redirect' in view) redirect(view.redirect)

  return (
    <DashboardShell>
      <CommandCenter firstName={view.firstName} stats={view.stats} />
    </DashboardShell>
  )
}
