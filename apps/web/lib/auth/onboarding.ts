import type { WorkspaceRole } from '@prisma/client'

/** Who finishes a workspace's set-up: its owner or an admin, never an invited member. */
export function needsOnboarding(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}
