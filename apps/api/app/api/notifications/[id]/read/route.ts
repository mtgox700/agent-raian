/**
 * POST /api/notifications/:id/read: mark a single notification as read
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { notificationReadScope } from '@/lib/auth/scope'
import { db } from '@/lib/db'
import { markNotificationRead } from '@/lib/services/notifications.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'inbox.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  await markNotificationRead(id, await notificationReadScope(db, workspace))

  return NextResponse.json({ ok: true })
}
