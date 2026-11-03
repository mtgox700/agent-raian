/**
 * Joining the workspace of an invitation (POST /api/invitations/[token]/accept).
 *
 * Moved from the former server action app/invite/[token]/actions.ts. Guarded
 * by the invitation itself: the signed-in account must own the invited
 * address (verified by Clerk), and the token is single use
 * (lib/team/team.service acceptInvitation). The route authenticates with
 * Clerk, then sets the active-workspace cookie and redirects.
 */

import { currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { acceptInvitation } from '@/lib/team/team.service'
import { recordAudit } from '@/lib/audit/audit'
import { limitAll } from '@/lib/security/shared-rate-limit'

/** Where the person goes next: back to the invitation with an error code, or into the joined workspace. */
export type AcceptInvitationOutcome =
  | { ok: false; redirectTo: string }
  | { ok: true; workspaceId: string }

export async function acceptInvitationAs(userId: string, token: string): Promise<AcceptInvitationOutcome> {
  const throttle = await limitAll([
    { key: `user:${userId}`, opts: { windowSec: 600, max: 10, scope: 'invite-accept' } },
    { key: `token:${token.slice(0, 16)}`, opts: { windowSec: 600, max: 10, scope: 'invite-accept' } },
  ])
  if (!throttle.allowed) return { ok: false, redirectTo: `/invite/${token}?error=TOO_SOON` }

  const user = await currentUser()
  const verifiedEmails = (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress)
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null

  const result = await acceptInvitation(db, { token, clerkId: userId, verifiedEmails, name })
  if (!result.ok) return { ok: false, redirectTo: `/invite/${token}?error=${result.error}` }
  await recordAudit(db, { workspaceId: result.value.workspaceId, userId: result.value.userId }, {
    action: 'invitation.accepted', target: { type: 'invitation', id: result.value.invitationId }, details: { role: result.value.role },
  })

  return { ok: true, workspaceId: result.value.workspaceId }
}
