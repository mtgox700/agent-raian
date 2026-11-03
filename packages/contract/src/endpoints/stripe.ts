/** Stripe billing: checkout and customer portal. */

import { z } from 'zod'
import { endpoint } from '../define'

export const stripeEndpoints = [
  // app/api/stripe/checkout/route.ts
  endpoint({
    id: 'stripe.checkout',
    method: 'POST',
    path: '/api/stripe/checkout',
    summary: 'Stripe Checkout URL for a plan; an already paying workspace switches plan in place and gets the success URL.',
    auth: 'session',
    body: z.object({
      plan: z.enum(['PRO', 'BUSINESS']),
      billing: z.enum(['monthly', 'annual']).default('monthly'),
      workspaceId: z.string().min(1),
    }),
    // session.url is nullable in Stripe's types, but is set for hosted checkout.
    response: z.object({ url: z.string().nullable() }),
  }),

  // app/api/stripe/portal/route.ts
  endpoint({
    id: 'stripe.portal',
    method: 'POST',
    path: '/api/stripe/portal',
    summary: 'Stripe Customer Portal URL.',
    auth: 'session',
    body: z.object({ workspaceId: z.string().min(1) }),
    response: z.object({ url: z.string() }),
  }),
]
