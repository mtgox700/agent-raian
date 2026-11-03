import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { CommandCenter } from '@/components/dashboard/home/CommandCenter'
import { NAV_ITEMS } from '@/lib/app-copy'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: NAV_ITEMS[0].label }

/** /dashboard: the command center (data: GET /api/views/dashboard). */
export default async function DashboardPage() {
  const view = await loadView('views.dashboard', {})
  if ('redirect' in view) redirect(view.redirect)

  return (
    <AppPage>
      <CommandCenter firstName={view.firstName} stats={view.stats} />
    </AppPage>
  )
}
