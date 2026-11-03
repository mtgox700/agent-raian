/**
 * GET /api/views/hot-leads: data of the Hot leads page (lib/views/hot-leads).
 * Without lead access the answer is `{ redirectTo: '/dashboard' }`: the page
 * redirects there, as before.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { hotLeadsView } from '@/lib/views/hot-leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) return NextResponse.json({ redirectTo: '/dashboard' })

  return NextResponse.json(await hotLeadsView(workspaceAccess.ctx))
}
