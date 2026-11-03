/**
 * POST /api/touches/[touchId]/sent: the user opened this queued message on
 * their phone: the sequence step counts as sent. Body: { body: string }
 * (the message as possibly edited before sending).
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { markQueuedSent, QUEUE_ERROR_MESSAGES, queueErrorStatus } from '@/lib/touch/touch.service'

export const runtime = 'nodejs'

const bodySchema = z.object({ body: z.string().max(2000) })

export async function POST(req: Request, { params }: { params: Promise<{ touchId: string }> }): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const workspaceAccess = await requireAccess(userId, 'lead.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  const { touchId } = await params
  const result = await markQueuedSent(workspace, touchId, parsed.data.body)
  if (!result.ok) {
    return NextResponse.json({ error: QUEUE_ERROR_MESSAGES[result.error], code: result.error }, { status: queueErrorStatus(result.error) })
  }
  return NextResponse.json({ ok: true, remainingToday: result.remainingToday })
}
