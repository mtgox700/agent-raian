import type { Metadata } from 'next'
import { LeadsScreen } from '@/components/dashboard/leads/LeadsScreen'
import { NAV_ITEMS } from '@/lib/app-copy'
import { loadView } from '@/lib/front/server-api'

export const metadata: Metadata = { title: NAV_ITEMS.find((i) => i.href === '/dashboard/leads')?.label }

/**
 * /dashboard/leads: the lead base (data: GET /api/views/leads). The view
 * never redirects: without lead access it returns an empty base. The header
 * (<AppPage>) lives in the screen: its counts and actions follow the search.
 */
export default async function LeadsPage() {
  const view = await loadView('views.leads', {})
  return <LeadsScreen view={view} />
}
