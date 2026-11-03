/**
 * Data of the invitation page (/invite/[token]), served by GET /api/views/invite/[token].
 * Public: the token is the key, and nothing is shown for an unusable one.
 * Joining also needs a signed-in account holding the invited address (see
 * app/invite/[token]/actions.ts).
 */

import type { PrismaClient } from '@prisma/client'
import { currentUser } from '@clerk/nextjs/server'
import { readInvitation, TEAM_ERRORS, type TeamError } from '@/lib/team/team.service'
import { ROLE_LABELS } from '@/lib/team/invitation-link'

export type InviteView =
  | { state: 'invalid' }
  | {
      state: 'ready'
      workspaceName: string
      inviterName: string
      roleLabel: string
      email: string
      signedIn: boolean
      /** The signed-in account holds the invited address among its verified e-mails. */
      emailVerified: boolean
      errorMessage: string | null
    }

export async function inviteView(
  db: PrismaClient,
  input: { token: string; userId: string | null; error?: string },
): Promise<InviteView> {
  const { token, userId, error } = input
  const invitation = await readInvitation(db, token)
  if (!invitation) return { state: 'invalid' }

  const user = userId ? await currentUser() : null
  const verified = (user?.emailAddresses ?? []).filter((e) => e.verification?.status === 'verified').map((e) => e.emailAddress.toLowerCase())
  const errorMessage = error && error in TEAM_ERRORS ? (TEAM_ERRORS[error as TeamError] || 'Le plan de cet espace n’a plus de place libre : demandez à un admin.') : null

  return {
    state:         'ready',
    workspaceName: invitation.workspace.name,
    inviterName:   invitation.inviterName,
    roleLabel:     ROLE_LABELS[invitation.role],
    email:         invitation.email,
    signedIn:      Boolean(userId),
    emailVerified: verified.includes(invitation.email),
    errorMessage,
  }
}
