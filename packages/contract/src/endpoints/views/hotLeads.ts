/** View endpoint of the Hot leads page (/dashboard/leads/hot), so the page never reads the database. */

import { z } from 'zod'
import { endpoint } from '../../define'
import { HotLead } from '../../schemas/leadPipeline'
import { Plan } from '../../schemas/analyst'

/** `FunnelStep` (apps/web/lib/repositories/campaigns.repository.ts). */
export const FunnelStep = z.object({
  label: z.string(),
  count: z.number(),
  color: z.string(),
  percentage: z.number(),
})

export const hotLeadsViewEndpoints = [
  // app/api/views/hot-leads/route.ts
  endpoint({
    id: 'views.hotLeads',
    method: 'GET',
    path: '/api/views/hot-leads',
    summary: 'Hot leads page: 50 hottest leads, their count and the workspace funnel; `redirectTo` without lead access.',
    auth: 'session',
    response: z.union([
      z.object({
        leads: z.array(HotLead),
        hotCount: z.number().int(),
        funnel: z.array(FunnelStep),
        plan: Plan,
      }),
      z.object({ redirectTo: z.literal('/dashboard') }),
    ]),
  }),
]
