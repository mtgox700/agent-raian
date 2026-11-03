/**
 * GET /api/activity
 * Returns the real activity feed for the authenticated workspace.
 * Query params: ?limit=20
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { getWorkspaceActivity } from '@/lib/repositories/activity.repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) return NextResponse.json({ events: [] })
  const workspace = workspaceAccess.ctx

  const url = new URL(req.url)
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') ?? '20', 10))

  const events = await getWorkspaceActivity(workspace, limit)
  return NextResponse.json({ events })
}
