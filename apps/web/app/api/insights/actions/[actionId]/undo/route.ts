/**
 * POST /api/insights/actions/:actionId/undo  undoes an action taken from an alert
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { db } from '@/lib/db'
import { undoAction } from '@/lib/insights/act'
import { limit } from '@/lib/security/shared-rate-limit'

export async function POST(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'workspace.read')
  if (!access.ok) return accessDenied(access)
  const throttle = await limit(`insight-act:${access.ctx.userId}`, { windowSec: 60, max: 20, scope: 'insight-act' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop d’actions : réessayez dans une minute.' }, { status: 429 })
  const result = await undoAction(db, access.ctx, (await params).actionId, req)
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status })
}
