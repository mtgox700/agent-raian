import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { PhoneQueueClient } from '@/components/dashboard/PhoneQueueClient'
import { loadView } from '@/lib/front/server-api'

/**
 * /dashboard/a-envoyer: WhatsApp/SMS sequence steps drafted by Phantera,
 * sent by the user from their phone, one tap each (data: GET /api/views/a-envoyer).
 */
export default async function PhoneQueuePage() {
  const view = await loadView('views.aEnvoyer', {})
  if ('redirect' in view) redirect(view.redirect)

  return (
    <DashboardShell>
      <PhoneQueueClient
        initialItems={view.items}
        initialRemaining={view.remainingToday}
      />
    </DashboardShell>
  )
}
