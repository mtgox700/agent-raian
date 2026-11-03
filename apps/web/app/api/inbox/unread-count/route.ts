/**
 * GET /api/inbox/unread-count: unread replies, for the sidebar badge.
 * 0 for plans without the replies inbox, so the badge never points to a
 * locked page.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { countUnreadReplies } from '@/lib/repositories/replies.repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INBOX_PLANS = new Set(['BUSINESS', 'ENTERPRISE'])

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'inbox.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  if (!INBOX_PLANS.has(workspace.plan)) return NextResponse.json({ count: 0 })

  return NextResponse.json({ count: await countUnreadReplies(workspace) })
}
