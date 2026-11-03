/** Team shapes (apps/api/lib/team/team.service.ts `listTeam`). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const WorkspaceRole = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'])
export const InvitableRole = z.enum(['ADMIN', 'MEMBER', 'VIEWER'])

export const TeamMember = z.object({
  userId: Id,
  name: z.string().nullable(),
  email: z.string(),
  imageUrl: z.string().nullable(),
  role: WorkspaceRole,
  since: IsoDate,
})

export const TeamInvitation = z.object({
  id: Id,
  email: z.string(),
  role: WorkspaceRole,
  expiresAt: IsoDate,
  createdAt: IsoDate,
})
