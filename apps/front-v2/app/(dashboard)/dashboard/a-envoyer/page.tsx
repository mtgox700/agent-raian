import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PhoneQueue } from '@/components/dashboard/a-envoyer/PhoneQueue'
import { NAV_ITEMS } from '@/lib/app-copy'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: NAV_ITEMS.find((i) => i.href === '/dashboard/a-envoyer')?.label }

/**
 * /dashboard/a-envoyer: WhatsApp/SMS sequence steps drafted by the agents,
 * sent by the user from their phone, one tap each (data: GET /api/views/a-envoyer).
 * The header (<AppPage>) lives in the queue: its counts move as messages go.
 */
export default async function PhoneQueuePage() {
  const view = await loadView('views.aEnvoyer', {})
  if ('redirect' in view) redirect(view.redirect)
  return <PhoneQueue initialItems={view.items} initialRemaining={view.remainingToday} />
}
