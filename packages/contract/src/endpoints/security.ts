/** Security: audit log, workspace security options, step-up probe. */

import { z } from 'zod'
import { endpoint, IsoDate, Ok } from '../define'
import { AuditEvent } from '../schemas/security'

export const securityEndpoints = [
  // app/api/security/audit/route.ts
  endpoint({
    id: 'security.listAudit',
    method: 'GET',
    path: '/api/security/audit',
    summary: 'Audit log, newest first: a page of 50 as JSON. With format=csv, the whole retained log as a CSV file (10 per hour).',
    auth: 'session',
    query: z.object({
      after: z.string().optional(),
      action: z.string().optional(),
      format: z.literal('csv').optional(),
    }),
    // With format=csv the answer is a text/csv download: link to it with api.url('security.listAudit', { query: { format: 'csv' } }).
    response: z.object({ events: z.array(AuditEvent), next: z.string().nullable() }),
  }),

  // app/api/security/settings/route.ts
  endpoint({
    id: 'security.getSettings',
    method: 'GET',
    path: '/api/security/settings',
    summary: 'Security options of the workspace.',
    auth: 'session',
    response: z.object({
      requireTwoFactor: z.boolean(),
      canManage: z.boolean(),
      ownTwoFactor: z.boolean().nullable(),
    }),
  }),
  // app/api/security/settings/route.ts
  endpoint({
    id: 'security.updateSettings',
    method: 'PATCH',
    path: '/api/security/settings',
    summary: 'Require two-factor for the team (owner only; turning it on needs the owner\'s own second factor, else 409 OWN_TWO_FACTOR_MISSING).',
    auth: 'stepUp',
    body: z.object({ requireTwoFactor: z.boolean() }),
    response: z.object({ ok: z.literal(true), requireTwoFactor: z.boolean() }),
  }),

  // app/api/security/step-up/route.ts
  endpoint({
    id: 'security.stepUp',
    method: 'POST',
    path: '/api/security/step-up',
    summary: 'Answers 200 when the session verified its factors recently, else Clerk\'s reverification error.',
    auth: 'stepUp',
    response: Ok,
  }),
]
