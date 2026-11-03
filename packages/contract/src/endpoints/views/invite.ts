/** View endpoint of the invitation page. Public: the token is the key. */

import { z } from 'zod'
import { endpoint } from '../../define'

export const inviteViewEndpoints = [
  // app/api/views/invite/[token]/route.ts
  endpoint({
    id: 'views.invite',
    method: 'GET',
    path: '/api/views/invite/[token]',
    summary: 'Invitation page: the invitation and what the visitor can do with it, or invalid (expired, used, revoked, unknown).',
    auth: 'public',
    params: z.object({ token: z.string() }),
    query: z.object({ error: z.string().optional() }),
    response: z.discriminatedUnion('state', [
      z.object({ state: z.literal('invalid') }),
      z.object({
        state: z.literal('ready'),
        workspaceName: z.string(),
        inviterName: z.string(),
        roleLabel: z.string(),
        email: z.string(),
        signedIn: z.boolean(),
        emailVerified: z.boolean(),
        errorMessage: z.string().nullable(),
      }),
    ]),
  }),
]
