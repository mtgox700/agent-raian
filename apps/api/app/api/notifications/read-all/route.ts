/**
 * POST /api/notifications/read-all: mark every unread notification as read
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { notificationReadScope } from '@/lib/auth/scope'
import { db } from '@/lib/db'
import { markAllNotificationsRead } from '@/lib/services/notifications.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'inbox.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  await markAllNotificationsRead(await notificationReadScope(db, workspace))

  return NextResponse.json({ ok: true })
}
