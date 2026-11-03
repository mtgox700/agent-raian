/**
 * POST /api/workspace/active: switches the active workspace. The choice is a
 * signed cookie, re-checked on every request: it only ever selects among the
 * workspaces the user belongs to.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_MAX_AGE, signActiveWorkspace } from '@/lib/auth/active-workspace'

export const runtime = 'nodejs'

const bodySchema = z.object({ workspaceId: z.string().min(1).max(64) })

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Espace invalide.' }, { status: 400 })

  const access = await requireAccess(userId, 'workspace.read', { workspaceId: parsed.data.workspaceId })
  if (!access.ok) return accessDenied(access)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, signActiveWorkspace(access.ctx.clerkUserId, access.ctx.workspaceId), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   ACTIVE_WORKSPACE_MAX_AGE,
  })
  return res
}
