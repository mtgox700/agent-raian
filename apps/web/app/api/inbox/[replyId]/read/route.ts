/**
 * POST /api/inbox/[replyId]/read
 *
 * Marks a reply as read by the workspace owner.
 * Reuses the EmailReply.isProcessed column as the "read" flag for V0.
 *
 * Plan-gated upstream by the page (only BUSINESS+ can reach the inbox).
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { markReplyRead } from '@/lib/repositories/replies.repository'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ replyId: string }> },
): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  }

  const workspaceAccess = await requireAccess(userId, 'inbox.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const { replyId } = await params

  // Plan-gate (defence in depth: page already gates upstream)
  if (workspace.plan !== 'BUSINESS' && workspace.plan !== 'ENTERPRISE') {
    return NextResponse.json(
      { error: 'La boîte de réponses est incluse à partir de la formule Business.' },
      { status: 402 },
    )
  }

  await markReplyRead(replyId, workspace)

  return NextResponse.json({ ok: true })
}
