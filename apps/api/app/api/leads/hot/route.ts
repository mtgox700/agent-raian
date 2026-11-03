/**
 * GET /api/leads/hot
 * Returns paginated hot leads (qualified / positive reply) for the workspace.
 * Query params: ?limit=25&cursor=<leadId>
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { getHotLeads } from '@/lib/repositories/leads.repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) return NextResponse.json({ leads: [], nextCursor: null })
  const workspace = workspaceAccess.ctx

  const url = new URL(req.url)
  const limit  = Math.min(50, parseInt(url.searchParams.get('limit') ?? '25', 10))
  const cursor = url.searchParams.get('cursor') ?? undefined

  const result = await getHotLeads(workspace, limit, cursor)
  return NextResponse.json(result)
}
