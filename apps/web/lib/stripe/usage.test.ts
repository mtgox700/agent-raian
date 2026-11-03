import { describe, it, expect, vi, afterEach } from 'vitest'

const create = vi.fn()
vi.mock('./client', () => ({
  getStripe: () => ({ billing: { meterEvents: { create } } }),
}))

import { reportActiveContactUsage, isUsageBillingConfigured } from './usage'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('isUsageBillingConfigured', () => {
  it('tracks STRIPE_SECRET_KEY', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect(isUsageBillingConfigured()).toBe(false)
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    expect(isUsageBillingConfigured()).toBe(true)
  })
})

describe('reportActiveContactUsage', () => {
  it('sends a meter event when configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    const ok = await reportActiveContactUsage({ stripeCustomerId: 'cus_1', count: 5 })
    expect(ok).toBe(true)
    expect(create).toHaveBeenCalledWith({
      event_name: 'active_contacts',
      payload: { stripe_customer_id: 'cus_1', value: '5' },
    })
  })

  it('honors a custom meter name', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    vi.stubEnv('STRIPE_ACTIVE_CONTACTS_METER', 'contacts_actifs')
    await reportActiveContactUsage({ stripeCustomerId: 'cus_1', count: 2 })
    expect(create.mock.calls[0][0].event_name).toBe('contacts_actifs')
  })

  it('skips when not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect(await reportActiveContactUsage({ stripeCustomerId: 'cus_1', count: 5 })).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('skips on missing customer or non-positive count', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    expect(await reportActiveContactUsage({ stripeCustomerId: '', count: 5 })).toBe(false)
    expect(await reportActiveContactUsage({ stripeCustomerId: 'cus_1', count: 0 })).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('floors fractional counts', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    await reportActiveContactUsage({ stripeCustomerId: 'cus_1', count: 3.9 })
    expect(create.mock.calls[0][0].payload.value).toBe('3')
  })
})
