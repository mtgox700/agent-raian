import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { AnalystPageClient } from '@/components/dashboard/analyst/AnalystPageClient'

/** /dashboard/analyst: the Analyst (E3). `?q=` prefills a question, never sends it. */
export default async function AnalystPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const { q } = await searchParams
  const initial = typeof q === 'string' ? q.slice(0, 500) : ''
  return (
    <DashboardShell>
      <AnalystPageClient initialQuestion={initial} />
    </DashboardShell>
  )
}
