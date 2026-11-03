/** View endpoint of the Leads page (/dashboard/leads), so the page never reads the database. */

import { z } from 'zod'
import { endpoint, Id } from '../../define'
import { LeadRow } from '../../schemas/lead'
import { Plan } from '../../schemas/analyst'

export const leadsViewEndpoints = [
  // app/api/views/leads/route.ts
  endpoint({
    id: 'views.leads',
    method: 'GET',
    path: '/api/views/leads',
    summary: 'Leads page: first leads of the base, campaigns, plan and real total (empty base on FREE without lead access).',
    auth: 'session',
    response: z.object({
      leads: z.array(LeadRow),
      campaigns: z.array(z.object({ id: Id, name: z.string(), status: z.string() })),
      /** Empty string without lead access. */
      workspaceId: z.string(),
      plan: Plan,
      totalLeadCount: z.number().int(),
      /** Offers with an annual price in Stripe. */
      annualPlans: z.array(z.enum(['PRO', 'BUSINESS', 'ENTERPRISE'])),
    }),
  }),
]
