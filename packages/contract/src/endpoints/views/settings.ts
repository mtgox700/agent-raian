/** View endpoint of the Settings page (apps/api/lib/views/settings.ts). */

import { z } from 'zod'
import { endpoint, IsoDate } from '../../define'
import { Plan } from '../../schemas/analyst'

export const SettingsBilling = z.object({
  annualPlans: z.array(z.enum(['PRO', 'BUSINESS', 'ENTERPRISE'])),
  workspaceId: z.string(),
  plan: Plan,
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  stripeCurrentPeriodEnd: IsoDate.nullable(),
  campaignsUsed: z.number().int(),
  campaignsLimit: z.number().nullable(),
  leadsUsed: z.number().int(),
  leadsLimit: z.number().nullable(),
})

export const settingsViewEndpoints = [
  // app/api/views/settings/route.ts
  endpoint({
    id: 'views.settings',
    method: 'GET',
    path: '/api/views/settings',
    summary: 'Settings page: profile, workspace, security access and billing (Stripe identifiers for billing managers only).',
    auth: 'session',
    response: z.object({
      userName: z.string(),
      userEmail: z.string(),
      workspaceId: z.string(),
      workspaceName: z.string(),
      canSeeSecurity: z.boolean(),
      billing: SettingsBilling,
    }),
  }),
]
