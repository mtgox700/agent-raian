/**
 * GET  /api/leads/[leadId]/touch: the last WhatsApp/SMS messages sent to the lead.
 * POST /api/leads/[leadId]/touch: records a message the user just sent from
 *      their phone. Body: { channel: "WHATSAPP" | "SMS", body: string }.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import type { Permission } from '@/lib/auth/permissions'
import { listTouches, recordTouch, TOUCH_ERROR_MESSAGES, touchErrorStatus } from '@/lib/touch/touch.service'

export const runtime = 'nodejs'

const bodySchema = z.object({ channel: z.enum(['WHATSAPP', 'SMS']), body: z.string().max(2000) })

async function workspaceFor(permission: Permission) {
  const { userId } = await auth()
  return requireAccess(userId, permission)
}

export async function GET(_req: Request, { params }: { params: Promise<{ leadId: string }> }): Promise<NextResponse> {
  const workspaceAccess = await workspaceFor('lead.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const { leadId } = await params
  const touches = await listTouches(workspace, leadId)
  return NextResponse.json({ ok: true, touches })
}

export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }): Promise<NextResponse> {
  const workspaceAccess = await workspaceFor('lead.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  const { leadId } = await params
  const result = await recordTouch(workspace, leadId, parsed.data.channel, parsed.data.body)
  if (!result.ok) {
    return NextResponse.json({ error: TOUCH_ERROR_MESSAGES[result.error], code: result.error }, { status: touchErrorStatus(result.error) })
  }
  return NextResponse.json({ ok: true, remainingToday: result.remainingToday })
}
