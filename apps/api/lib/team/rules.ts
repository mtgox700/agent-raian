/**
 * Who may change whom in a team. Pure: the callers read the facts (roles,
 * how many owners) under a lock and apply the answer.
 *
 * - Managing the team (team.manage) is for OWNER and ADMIN.
 * - Only an OWNER grants or takes OWNER or ADMIN, and only an OWNER changes
 *   or removes another OWNER or an ADMIN: an admin cannot promote themselves
 *   nor push out the people above them.
 * - Anyone may leave. The last OWNER may not leave, be removed or demoted:
 *   a workspace always has someone who can pay and decide.
 * - Nobody is invited as OWNER: one becomes OWNER by promotion, once inside.
 */

import type { WorkspaceRole } from '@prisma/client'
import { can } from '@/lib/auth/permissions'

export type TeamRefusal =
  | 'NOT_ALLOWED'      // the actor's role does not allow it
  | 'LAST_OWNER'       // it would leave the workspace without an OWNER
  | 'INVALID_ROLE'     // not a role one can be invited with

export const TEAM_REFUSALS: Record<TeamRefusal, string> = {
  NOT_ALLOWED:  'Votre rôle ne permet pas ce changement dans l’équipe.',
  LAST_OWNER:   'Il faut au moins un propriétaire : nommez-en un autre avant.',
  INVALID_ROLE: 'Ce rôle ne peut pas être attribué par invitation.',
}

const HIGH: WorkspaceRole[] = ['OWNER', 'ADMIN']
const isHigh = (role: WorkspaceRole) => HIGH.includes(role)

type Verdict = { ok: true } | { ok: false; refusal: TeamRefusal }
const yes: Verdict = { ok: true }
const no = (refusal: TeamRefusal): Verdict => ({ ok: false, refusal })

export const INVITABLE_ROLES: WorkspaceRole[] = ['ADMIN', 'MEMBER', 'VIEWER']

export function canInvite(actor: WorkspaceRole, role: WorkspaceRole): Verdict {
  if (!INVITABLE_ROLES.includes(role)) return no('INVALID_ROLE')
  if (!can(actor, 'team.manage')) return no('NOT_ALLOWED')
  if (role === 'ADMIN' && actor !== 'OWNER') return no('NOT_ALLOWED')
  return yes
}

export function canChangeRole(input: {
  actor: WorkspaceRole
  target: WorkspaceRole
  next: WorkspaceRole
  owners: number
}): Verdict {
  const { actor, target, next, owners } = input
  if (target === next) return yes
  if (!can(actor, 'team.manage')) return no('NOT_ALLOWED')
  if ((isHigh(target) || isHigh(next)) && actor !== 'OWNER') return no('NOT_ALLOWED')
  // An owner may demote themselves, as long as another owner remains.
  if (target === 'OWNER' && owners <= 1) return no('LAST_OWNER')
  return yes
}

export function canRemove(input: {
  actor: WorkspaceRole
  actorIsTarget: boolean
  target: WorkspaceRole
  owners: number
}): Verdict {
  const { actor, actorIsTarget, target, owners } = input
  if (target === 'OWNER' && owners <= 1) return no('LAST_OWNER')
  if (actorIsTarget) return yes
  if (!can(actor, 'team.manage')) return no('NOT_ALLOWED')
  if (isHigh(target) && actor !== 'OWNER') return no('NOT_ALLOWED')
  return yes
}

/** Who may take over a leaving member's campaigns and mailboxes. */
export function canReceiveTransfer(role: WorkspaceRole): boolean {
  return isHigh(role)
}
