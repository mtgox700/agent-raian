import { describe, expect, it, vi } from 'vitest'
import { switchExistingSubscription, type SubscriptionApi } from './change-plan'

function api(sub: { status: string; priceId: string } | Error, pending = false) {
  const update = vi.fn(async (_id: string, params: Record<string, unknown>) =>
    ('items' in params && pending ? { pending_update: { expires_at: 1 } } : { pending_update: null }))
  const client: SubscriptionApi = {
    subscriptions: {
      retrieve: vi.fn(async () => {
        if (sub instanceof Error) throw sub
        return { id: 'sub_1', status: sub.status, items: { data: [{ id: 'si_1', price: { id: sub.priceId } }] } }
      }),
      update,
    },
  }
  return { client, update }
}

const meta = { workspaceId: 'ws1', plan: 'BUSINESS', billing: 'monthly' }

describe('switchExistingSubscription', () => {
  it('switches the live subscription, invoices the difference now and only applies it once paid', async () => {
    const { client, update } = api({ status: 'active', priceId: 'price_pro' })
    expect(await switchExistingSubscription(client, 'sub_1', 'price_business', meta)).toBe('UPDATED')
    expect(update).toHaveBeenNthCalledWith(1, 'sub_1', {
      items: [{ id: 'si_1', price: 'price_business' }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    })
    expect(update).toHaveBeenNthCalledWith(2, 'sub_1', { metadata: meta })
  })

  it('reports an upgrade that waits for its payment', async () => {
    const { client, update } = api({ status: 'active', priceId: 'price_pro' }, true)
    expect(await switchExistingSubscription(client, 'sub_1', 'price_business', meta)).toBe('PENDING_PAYMENT')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('refuses a no-op change to the current plan', async () => {
    const { client, update } = api({ status: 'active', priceId: 'price_pro' })
    expect(await switchExistingSubscription(client, 'sub_1', 'price_pro', meta)).toBe('SAME_PLAN')
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses to change plan while an invoice is unpaid', async () => {
    const { client, update } = api({ status: 'past_due', priceId: 'price_pro' })
    expect(await switchExistingSubscription(client, 'sub_1', 'price_business', meta)).toBe('PAYMENT_ISSUE')
    expect(update).not.toHaveBeenCalled()
  })

  it('lets a new checkout happen when the old subscription is over', async () => {
    const { client } = api({ status: 'canceled', priceId: 'price_pro' })
    expect(await switchExistingSubscription(client, 'sub_1', 'price_business', meta)).toBe('NO_ACTIVE')
  })

  it('treats a subscription unknown to Stripe as over', async () => {
    const { client } = api(Object.assign(new Error('No such subscription'), { code: 'resource_missing' }))
    expect(await switchExistingSubscription(client, 'sub_gone', 'price_business', meta)).toBe('NO_ACTIVE')
  })

  it('throws on any other Stripe error instead of allowing a second subscription', async () => {
    const { client } = api(new Error('Stripe API unavailable'))
    await expect(switchExistingSubscription(client, 'sub_1', 'price_business', meta)).rejects.toThrow('unavailable')
  })
})
