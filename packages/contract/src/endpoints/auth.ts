/** OAuth consent starts for mailboxes (browser navigation, redirects to the provider). */

import { z } from 'zod'
import { endpoint, Id } from '../define'

export const authEndpoints = [
  // app/api/auth/gmail/route.ts
  endpoint({
    id: 'auth.gmailStart',
    method: 'GET',
    path: '/api/auth/gmail',
    summary: 'Start the Google OAuth consent flow (302 to Google; to /dashboard/settings?mailbox=error&reason=… when access or step-up fails).',
    auth: 'stepUp',
    query: z.object({ workspaceId: Id }),
    response: z.never(),
    responseKind: 'redirect',
  }),

  // app/api/auth/outlook/route.ts
  endpoint({
    id: 'auth.outlookStart',
    method: 'GET',
    path: '/api/auth/outlook',
    summary: 'Start the Microsoft OAuth consent flow (302 to Microsoft; to /dashboard/settings?mailbox=error&reason=… when access or step-up fails).',
    auth: 'stepUp',
    query: z.object({ workspaceId: Id }),
    response: z.never(),
    responseKind: 'redirect',
  }),
]
