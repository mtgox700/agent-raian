import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CommandCenter } from '@/components/dashboard/CommandCenter'
import { requireAccess } from '@/lib/auth/access'
import { getDashboardStats } from '@/lib/services/dashboard.service'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [clerkUser, access] = await Promise.all([
    currentUser(),
    requireAccess(userId, 'workspace.read'),
  ])

  if (!access.ok) redirect('/onboarding')
  const workspace = access.ctx

  const [stats] = await Promise.all([
    getDashboardStats(workspace),
  ])

  const firstName = clerkUser?.firstName ?? 'Agent'

  return (
    <DashboardShell>
      <CommandCenter firstName={firstName} stats={stats} />
    </DashboardShell>
  )
}
