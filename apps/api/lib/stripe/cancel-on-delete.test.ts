import { describe, expect, it, vi } from 'vitest'
import { cancelSubscriptionsOfUser } from './cancel-on-delete'

const dbWith = (ids: Array<string | null>) => ({
  workspace: { findMany: vi.fn(async () => ids.map((stripeSubscriptionId) => ({ stripeSubscriptionId }))) },
})

describe('cancelSubscriptionsOfUser', () => {
  it('cancels every subscription of the deleted user', async () => {
    const cancel = vi.fn(async () => ({}))
    const n = await cancelSubscriptionsOfUser(dbWith(['sub_1', 'sub_2']), { subscriptions: { cancel } }, 'user_1')
    expect(n).toBe(2)
    expect(cancel).toHaveBeenCalledWith('sub_1')
    expect(cancel).toHaveBeenCalledWith('sub_2')
  })

  it('ignores a subscription Stripe no longer has', async () => {
    const cancel = vi.fn(async () => { throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' }) })
    await expect(cancelSubscriptionsOfUser(dbWith(['sub_gone']), { subscriptions: { cancel } }, 'user_1')).resolves.toBe(0)
  })

  it('fails loudly on any other error so the deletion is retried, not done while still billing', async () => {
    const cancel = vi.fn(async () => { throw new Error('Stripe unavailable') })
    await expect(cancelSubscriptionsOfUser(dbWith(['sub_1']), { subscriptions: { cancel } }, 'user_1')).rejects.toThrow('Stripe unavailable')
  })
})
