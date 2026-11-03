/**
 * POST /api/invitations/[token]/accept
 *
 * The « Rejoindre l’espace » form of /invite/[token] posts here. Answers with
 * a 303, like the server action it replaces: to /dashboard with the joined
 * workspace active, back to /invite/[token]?error=CODE on refusal, to sign-in
 * without a session. No requireAccess: the person is not a member yet; the
 * invitation is the guard (verified invited address, single-use token, see
 * lib/actions/accept-invitation and lib/auth/public-surfaces).
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { acceptInvitationAs } from '@/lib/actions/accept-invitation'
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_MAX_AGE, signActiveWorkspace } from '@/lib/auth/active-workspace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

function seeOther(req: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), 303)
}

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const { token } = await params
  const { userId } = await auth()
  if (!userId) return seeOther(req, `/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`)

  const outcome = await acceptInvitationAs(userId, token)
  if (!outcome.ok) return seeOther(req, outcome.redirectTo)

  // The workspace just joined becomes the active one.
  const res = seeOther(req, '/dashboard')
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, signActiveWorkspace(userId, outcome.workspaceId), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   ACTIVE_WORKSPACE_MAX_AGE,
  })
  return res
}
