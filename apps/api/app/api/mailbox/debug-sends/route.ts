/**
 * GET /api/mailbox/debug-sends?workspaceId=…
 *
 * Returns the last 10 EmailSends for the workspace with all tracking IDs visible.
 * Used to debug:
 *   - Why opens are not tracked (status, openedAt visible)
 *   - Why replies are not detected (providerMessageId visible)
 *
 * Auth: Clerk user must own the workspace.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Diagnostics expose configuration: off in production unless switched on
  // for an investigation (ENABLE_DEBUG_ROUTES=1).
  if (process.env.VERCEL_ENV === 'production' && process.env.ENABLE_DEBUG_ROUTES !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  // Verify ownership
  const access = await requireAccess(userId, 'settings.manage', { workspaceId: workspaceId })
  if (!access.ok) return accessDenied(access)

  const sends = await db.emailSend.findMany({
    where:    { campaign: { workspaceId } },
    orderBy:  { createdAt: 'desc' },
    take:     10,
    select: {
      id:                true,
      status:            true,
      sentAt:            true,
      openedAt:          true,
      clickedAt:         true,
      resendMessageId:   true,
      providerMessageId: true,
      providerThreadId:  true,
      errorMessage:      true,
      createdAt:         true,
      lead:     { select: { email: true, firstName: true, lastName: true } },
      campaign: { select: { name: true, connectedMailboxId: true } },
      replies:  { select: { id: true, classification: true, fromEmail: true, receivedAt: true } },
    },
  })

  // Also list connected mailboxes for context
  const mailboxes = await db.connectedMailbox.findMany({
    where:  { workspaceId },
    select: {
      id: true, provider: true, email: true, status: true, isDefault: true,
      lastSyncAt: true, lastSyncError: true, lastHistoryId: true,
    },
  })

  return NextResponse.json({
    workspaceId,
    mailboxes,
    sends: sends.map((s) => ({
      ...s,
      _hint: {
        openTracked:   Boolean(s.openedAt),
        hasReply:      s.replies.length > 0,
        canMatchReply: Boolean(s.providerMessageId),
        sentViaGmail:  Boolean(s.providerMessageId && !s.resendMessageId),
      },
    })),
  })
}
