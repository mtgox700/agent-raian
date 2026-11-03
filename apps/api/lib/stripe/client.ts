/**
 * Phantera: Stripe client (lazy singleton)
 *
 * Lazy initialization: does NOT throw at import time.
 * Throws only when the client is actually used (at request time).
 * This prevents Next.js build errors when STRIPE_SECRET_KEY is not set.
 */

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }

  _stripe = new Stripe(apiKey, {
    apiVersion: '2026-03-25.dahlia',
    typescript: true,
  })

  return _stripe
}

// Named export for convenience: lazily initialized
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    const instance = getStripe() as unknown as Record<string | symbol, unknown>
    return instance[prop]
  },
})
