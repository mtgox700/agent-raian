/**
 * POST /api/insights/:id/act  { action: 'pause' | 'change_sender', sender?: { mailboxId, fromAlias } }
 * Takes one of the alert's actions, confirmed by the person in the interface.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { db } from '@/lib/db'
import { takeAction } from '@/lib/insights/act'
import { limit } from '@/lib/security/shared-rate-limit'

const bodySchema = z.object({
  action: z.string().min(1).max(40),
  sender: z.object({ mailboxId: z.string().min(1).max(64).nullable(), fromAlias: z.string().min(3).max(254).nullable() }).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'workspace.read')
  if (!access.ok) return accessDenied(access)
  const throttle = await limit(`insight-act:${access.ctx.userId}`, { windowSec: 60, max: 20, scope: 'insight-act' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop d’actions : réessayez dans une minute.' }, { status: 429 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  const result = await takeAction(db, access.ctx, (await params).id, parsed.data.action, { sender: parsed.data.sender }, req)
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status })
}
