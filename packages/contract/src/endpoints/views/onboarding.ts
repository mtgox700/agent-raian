/** View endpoint of the onboarding layout: whether the page may render, or where to go instead. */

import { z } from 'zod'
import { endpoint } from '../../define'

export const onboardingViewEndpoints = [
  // app/api/views/onboarding/route.ts
  endpoint({
    id: 'views.onboarding',
    method: 'GET',
    path: '/api/views/onboarding',
    summary: 'Onboarding layout: ready for a user still to set up, else where to send them (pending invitation, dashboard).',
    auth: 'session',
    response: z.discriminatedUnion('state', [
      z.object({ state: z.literal('ready') }),
      z.object({ state: z.literal('redirect'), to: z.string() }),
    ]),
  }),
]
