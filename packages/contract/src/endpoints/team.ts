/** Team: members, invitations, roles. */

import { z } from 'zod'
import { endpoint, Id, IsoDate, Ok } from '../define'
import { InvitableRole, TeamInvitation, TeamMember, WorkspaceRole } from '../schemas/team'

export const teamEndpoints = [
  // app/api/team/route.ts
  endpoint({
    id: 'team.list',
    method: 'GET',
    path: '/api/team',
    summary: 'Members of the active workspace; pending invitations only for those who manage the team.',
    auth: 'session',
    response: z.object({
      members: z.array(TeamMember),
      invitations: z.array(TeamInvitation),
      seats: z.object({ used: z.number().int(), limit: z.number().nullable(), planName: z.string() }),
      me: z.object({ userId: Id, role: WorkspaceRole, managesTeam: z.boolean() }),
    }),
  }),

  // app/api/team/invitations/route.ts
  endpoint({
    id: 'team.invite',
    method: 'POST',
    path: '/api/team/invitations',
    summary: 'Invite someone by e-mail; the link is mailed and returned once.',
    auth: 'session',
    body: z.object({ email: z.string().min(3).max(254), role: InvitableRole }),
    response: z.object({ id: Id, email: z.string(), expiresAt: IsoDate, url: z.string(), emailSent: z.boolean() }),
  }),

  // app/api/team/invitations/[invitationId]/route.ts
  endpoint({
    id: 'team.revokeInvitation',
    method: 'DELETE',
    path: '/api/team/invitations/[invitationId]',
    summary: 'Cancel a pending invitation.',
    auth: 'session',
    params: z.object({ invitationId: Id }),
    response: Ok,
  }),

  // app/api/invitations/[token]/accept/route.ts
  endpoint({
    id: 'team.acceptInvitation',
    method: 'POST',
    path: '/api/invitations/[token]/accept',
    summary: 'Join the workspace of an invitation (HTML form post): 303 to /dashboard with that workspace active; 303 back to /invite/[token]?error=CODE on refusal, to sign-in without a session.',
    auth: 'session',
    params: z.object({ token: z.string().min(1) }),
    response: z.never(),
    responseKind: 'redirect',
  }),

  // app/api/team/members/[userId]/route.ts
  endpoint({
    id: 'team.changeRole',
    method: 'PATCH',
    path: '/api/team/members/[userId]',
    summary: 'Change a member\'s role.',
    auth: 'stepUp',
    params: z.object({ userId: Id }),
    body: z.object({ role: WorkspaceRole }),
    response: Ok,
  }),
  // app/api/team/members/[userId]/route.ts
  endpoint({
    id: 'team.removeMember',
    method: 'DELETE',
    path: '/api/team/members/[userId]',
    summary: 'Remove a member, or leave (leaving one\'s own seat needs no step-up). With transferTo, resources go to that admin; otherwise campaigns pause.',
    auth: 'stepUp',
    params: z.object({ userId: Id }),
    query: z.object({ transferTo: z.string().optional() }),
    response: z.object({ ok: z.literal(true), pausedCampaigns: z.number().int() }),
  }),
]
