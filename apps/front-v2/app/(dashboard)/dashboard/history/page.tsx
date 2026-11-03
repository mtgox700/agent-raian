import type { Metadata } from 'next'
import { AppPage } from '@/components/app/AppPage'
import { HistoryTimeline } from '@/components/dashboard/history/HistoryTimeline'
import { historyCopy } from '@/lib/copy/history'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: historyCopy.title }

/** /dashboard/history: campaign events and notifications, newest first (data: GET /api/views/history). */
export default async function HistoryPage() {
  const { events } = await loadView('views.history', {})
  return (
    <AppPage title={historyCopy.title} description={historyCopy.description}>
      <HistoryTimeline events={events} />
    </AppPage>
  )
}
