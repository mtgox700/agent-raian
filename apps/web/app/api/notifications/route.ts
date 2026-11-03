/**
 * GET  /api/notifications: list (all or unread)
 * Query: ?unread=true&limit=20
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { notificationScope } from '@/lib/auth/scope'
import { db } from '@/lib/db'
import { listNotifications, countUnreadNotifications } from '@/lib/services/notifications.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) return NextResponse.json({ notifications: [], unreadCount: 0 })
  const workspace = workspaceAccess.ctx

  const url        = new URL(req.url)
  const unreadOnly  = url.searchParams.get('unread') === 'true'
  const rawLimit    = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const limit       = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 20

  const scope = await notificationScope(db, workspace)
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(scope, { unreadOnly, limit }),
    countUnreadNotifications(scope),
  ])

  return NextResponse.json({ notifications, unreadCount })
}
