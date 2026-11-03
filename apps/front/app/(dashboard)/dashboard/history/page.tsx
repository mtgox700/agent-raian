import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { HistoryPageClient } from '@/components/dashboard/HistoryPageClient'
import { loadView } from '@/lib/front/server-api'

/** /dashboard/history: unified activity & campaign timeline (data: GET /api/views/history). */
export default async function HistoryPage() {
  const { events } = await loadView('views.history', {})
  return (
    <DashboardShell>
      <HistoryPageClient events={events} />
    </DashboardShell>
  )
}
