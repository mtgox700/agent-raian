/**
 * GET /api/views/inbox?filter=&page=: data of the Reply Inbox page (lib/views/inbox).
 * Without inbox access the answer is `{ redirectTo: '/onboarding' }`: the
 * page redirects there, as before.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { inboxView } from '@/lib/views/inbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'inbox.read')
  if (!workspaceAccess.ok) return NextResponse.json({ redirectTo: '/onboarding' })

  const sp = req.nextUrl.searchParams
  return NextResponse.json(await inboxView(workspaceAccess.ctx, {
    filter: sp.get('filter') ?? undefined,
    page:   sp.get('page') ?? undefined,
  }))
}
