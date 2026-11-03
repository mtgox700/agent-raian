'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { acceptInvitation } from '@/lib/team/team.service'
import { recordAudit } from '@/lib/audit/audit'
import { limitAll } from '@/lib/security/shared-rate-limit'
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_MAX_AGE, signActiveWorkspace } from '@/lib/auth/active-workspace'

/**
 * Joins the workspace of an invitation. Guarded by the invitation itself:
 * the signed-in account must own the invited address (verified by Clerk), and
 * the token is single use (lib/team/team.service acceptInvitation).
 */
export async function acceptInvitationAction(token: string): Promise<void> {
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`)

  const throttle = await limitAll([
    { key: `user:${userId}`, opts: { windowSec: 600, max: 10, scope: 'invite-accept' } },
    { key: `token:${token.slice(0, 16)}`, opts: { windowSec: 600, max: 10, scope: 'invite-accept' } },
  ])
  if (!throttle.allowed) redirect(`/invite/${token}?error=TOO_SOON`)

  const user = await currentUser()
  const verifiedEmails = (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress)
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null

  const result = await acceptInvitation(db, { token, clerkId: userId, verifiedEmails, name })
  if (!result.ok) redirect(`/invite/${token}?error=${result.error}`)
  await recordAudit(db, { workspaceId: result.value.workspaceId, userId: result.value.userId }, {
    action: 'invitation.accepted', target: { type: 'invitation', id: result.value.invitationId }, details: { role: result.value.role },
  })

  // The workspace just joined becomes the active one.
  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, signActiveWorkspace(userId, result.value.workspaceId), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   ACTIVE_WORKSPACE_MAX_AGE,
  })
  redirect('/dashboard')
}
