/**
 * POST /api/touches/[touchId]/skip: passes over a queued WhatsApp/SMS
 * message: the lead's sequence goes on to its next step.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { QUEUE_ERROR_MESSAGES, queueErrorStatus, skipQueued } from '@/lib/touch/touch.service'

export const runtime = 'nodejs'

export async function POST(_req: Request, { params }: { params: Promise<{ touchId: string }> }): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const workspaceAccess = await requireAccess(userId, 'lead.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const { touchId } = await params
  const result = await skipQueued(workspace, touchId)
  if (!result.ok) {
    return NextResponse.json({ error: QUEUE_ERROR_MESSAGES[result.error], code: result.error }, { status: queueErrorStatus(result.error) })
  }
  return NextResponse.json({ ok: true })
}
