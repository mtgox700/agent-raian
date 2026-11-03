/**
 * POST /api/leads/[leadId]/touch/draft: drafts the WhatsApp or SMS message
 * the user will send from their phone. Body: { channel: "WHATSAPP" | "SMS" }.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { limit } from '@/lib/security/shared-rate-limit'
import { draftTouch, TOUCH_ERROR_MESSAGES, touchErrorStatus } from '@/lib/touch/touch.service'

export const runtime = 'nodejs'

const bodySchema = z.object({ channel: z.enum(['WHATSAPP', 'SMS']) })

export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const workspaceAccess = await requireAccess(userId, 'lead.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // Each draft calls the LLM.
  const rl = await limit(`user:${userId}`, { windowSec: 60, max: 20, scope: 'touch:draft' })
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de demandes : patientez une minute.' }, { status: 429 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Canal invalide.' }, { status: 400 })

  const { leadId } = await params
  const result = await draftTouch(workspace, leadId, parsed.data.channel)
  if (!result.ok) {
    return NextResponse.json({ error: TOUCH_ERROR_MESSAGES[result.error], code: result.error }, { status: touchErrorStatus(result.error) })
  }
  return NextResponse.json({ ok: true, body: result.body, remainingToday: result.remainingToday })
}
