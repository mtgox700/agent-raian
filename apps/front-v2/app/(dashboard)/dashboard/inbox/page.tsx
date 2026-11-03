import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { InboxLocked } from '@/components/dashboard/inbox/InboxLocked'
import { InboxScreen } from '@/components/dashboard/inbox/InboxScreen'
import { inboxCopy as t } from '@/lib/copy/inbox'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: t.title }

/**
 * /dashboard/inbox: the replies to campaigns, classified by the AI. Business
 * plan and above (data and gate: GET /api/views/inbox, filter and page from the URL).
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const { filter, page } = await searchParams
  const view = await loadView('views.inbox', { query: { filter, page } })
  if ('redirectTo' in view) redirect(view.redirectTo)

  if (view.locked) {
    return <AppPage><InboxLocked price={view.businessPrice} annualDiscount={view.businessAnnualDiscount} /></AppPage>
  }

  return (
    <AppPage
      title={t.title}
      description={<><span className="font-mono tabular-nums text-ink">{view.total}</span>{t.countWord(view.total)}{t.sorted}</>}
    >
      <Suspense>
        <InboxScreen replies={view.replies} page={view.page} totalPages={view.totalPages} filter={view.filter} />
      </Suspense>
    </AppPage>
  )
}
