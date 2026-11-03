import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { PhoneQueueClient } from '@/components/dashboard/PhoneQueueClient'
import { requireAccess } from '@/lib/auth/access'
import { listQueue } from '@/lib/touch/touch.service'

/**
 * /dashboard/a-envoyer: WhatsApp/SMS sequence steps drafted by Phantera,
 * sent by the user from their phone, one tap each.
 */
export default async function PhoneQueuePage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) redirect('/onboarding')
  const workspace = workspaceAccess.ctx

  const { items, remainingToday } = await listQueue(workspace)

  return (
    <DashboardShell>
      <PhoneQueueClient
        initialItems={items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))}
        initialRemaining={remainingToday}
      />
    </DashboardShell>
  )
}
