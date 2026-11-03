/**
 * GET /api/invitations/[token]/start?with=sign-up|sign-in: keeps the invitation in a
 * short-lived cookie, then hands over to Clerk (lib/team/pending-invite).
 * Only a token of a valid invitation is kept.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readInvitation } from '@/lib/team/team.service'
import { PENDING_INVITE_COOKIE, pendingInviteCookie } from '@/lib/team/pending-invite'
import { ipKey, limit } from '@/lib/security/shared-rate-limit'

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await params
  const url = new URL(req.url)
  // Token guessing is hopeless (256 bits), but each try is a lookup: capped per IP.
  const network = ipKey(req)
  const throttle = network ? await limit(network, { windowSec: 600, max: 30, scope: 'invite-start' }) : { allowed: true }
  if (!throttle.allowed) return NextResponse.redirect(new URL(`/invite/${encodeURIComponent(token)}?error=TOO_SOON`, url))
  const invitation = await readInvitation(db, token)
  if (!invitation) return NextResponse.redirect(new URL(`/invite/${encodeURIComponent(token)}`, url))

  const target = url.searchParams.get('with') === 'sign-in' ? '/sign-in' : '/sign-up'
  const res = NextResponse.redirect(new URL(target, url))
  res.cookies.set(PENDING_INVITE_COOKIE, token, pendingInviteCookie)
  return res
}
