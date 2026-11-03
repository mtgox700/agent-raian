/**
 * What each workspace role may do, by business verb rather than by route.
 * Routes ask for a permission; this table is the only place roles are read.
 *
 * OWNER   everything, including billing and deleting data.
 * ADMIN   runs the workspace and the team, not billing nor deletion.
 * MEMBER  prospects: campaigns, leads, replies, own mailboxes and channels.
 *         (Which campaigns and mailboxes are « own » is decided per resource.)
 * VIEWER  reads, writes nothing.
 */

import type { WorkspaceRole } from '@prisma/client'

export const PERMISSIONS = [
  'workspace.read',
  'campaign.read',
  'campaign.write',
  'campaign.launch',
  'lead.read',
  'lead.write',
  'lead.export',
  'inbox.read',
  'inbox.write',
  'mailbox.read',
  'mailbox.connect',
  'mailbox.manage',
  'channel.manage',
  'phone.reveal',
  'ai.generate',
  'analyst.ask',
  'settings.manage',
  'team.manage',
  'billing.manage',
  'data.delete',
  'audit.read',
  'security.manage',
  'data.export',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const READ: Permission[] = ['workspace.read', 'campaign.read', 'lead.read', 'inbox.read', 'mailbox.read', 'analyst.ask']

const PROSPECTING: Permission[] = [
  ...READ,
  'campaign.write',
  'campaign.launch',
  'lead.write',
  'lead.export',
  'inbox.write',
  'mailbox.connect',
  'mailbox.manage',
  'channel.manage',
  'phone.reveal',
  'ai.generate',
]

const OWNER_ONLY: Permission[] = ['billing.manage', 'data.delete', 'security.manage']

export const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  OWNER:  new Set(PERMISSIONS),
  ADMIN:  new Set(PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p))),
  MEMBER: new Set(PROSPECTING),
  VIEWER: new Set(READ),
}

export function can(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

/** Roles that see every resource of the workspace, not only their own. */
export function seesWholeWorkspace(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'VIEWER'
}
