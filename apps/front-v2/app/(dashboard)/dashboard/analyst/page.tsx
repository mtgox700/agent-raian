import type { Metadata } from 'next'
import { AppPage } from '@/components/app/AppPage'
import { AnalystScreen } from '@/components/dashboard/analyst/AnalystScreen'
import { analystCopy } from '@/lib/copy/analyst'

export const metadata: Metadata = { title: analystCopy.title }

/**
 * /dashboard/analyst: the Analyst. The session gate is the dashboard layout;
 * the screen loads its data in the browser (analyst.overview, then
 * analyst.suggestions) and asks through the analyst.ask stream.
 * `?q=` prefills a question, never sends it.
 */
export default async function AnalystPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams
  const initial = typeof q === 'string' ? q.slice(0, 500) : ''
  return (
    <AppPage title={analystCopy.title} description={analystCopy.description}>
      <AnalystScreen initialQuestion={initial} />
    </AppPage>
  )
}
