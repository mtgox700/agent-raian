/**
 * GET /invite/resume: back to the invitation kept before signing in or up.
 * The cookie is consumed here: the layouts send someone here once at most.
 */
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { hashInvitationToken } from '@/lib/team/invitation-link'
import { PENDING_INVITE_COOKIE } from '@/lib/team/pending-invite'

export async function GET(req: Request): Promise<NextResponse> {
  const store = await cookies()
  const token = store.get(PENDING_INVITE_COOKIE)?.value ?? ''
  const target = hashInvitationToken(token) ? `/invite/${token}` : '/dashboard'
  const res = NextResponse.redirect(new URL(target, req.url))
  res.cookies.delete(PENDING_INVITE_COOKIE)
  return res
}
