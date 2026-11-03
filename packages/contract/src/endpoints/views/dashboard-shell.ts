/** View endpoint of the dashboard layout: its gate (where to send the visitor) and the Sidebar data. */

import { z } from 'zod'
import { endpoint, Id } from '../../define'
import { Plan } from '../../schemas/analyst'
import { WorkspaceRole } from '../../schemas/team'

export const dashboardShellViewEndpoints = [
  // app/api/views/dashboard-shell/route.ts
  endpoint({
    id: 'views.dashboardShell',
    method: 'GET',
    path: '/api/views/dashboard-shell',
    summary: 'Dashboard layout: where to send the visitor (pending invitation, onboarding, sign-in) or the active workspace and the user\'s workspaces.',
    auth: 'session',
    response: z.discriminatedUnion('state', [
      z.object({ state: z.literal('redirect'), to: z.string() }),
      z.object({
        state: z.literal('ready'),
        workspace: z.object({ id: Id, name: z.string(), plan: Plan }),
        workspaces: z.array(z.object({ workspaceId: Id, name: z.string(), role: WorkspaceRole })),
      }),
    ]),
  }),
]
