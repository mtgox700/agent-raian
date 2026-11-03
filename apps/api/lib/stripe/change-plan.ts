/**
 * Plan changes for a workspace that already pays.
 *
 * Opening a new Checkout session for an upgrade created a SECOND
 * subscription: the customer was charged twice and the old one was no longer
 * tracked. An existing live subscription is switched to the new price
 * instead:
 *  - the difference is invoiced immediately (always_invoice), not at the next
 *    renewal, which could be up to a year later on an annual plan;
 *  - with pending_if_incomplete, Stripe only applies the new price once that
 *    invoice is paid, so an upgrade never runs unpaid;
 *  - a subscription with an unpaid invoice (past_due) cannot change plan.
 */

export interface SubscriptionApi {
  subscriptions: {
    retrieve(id: string): Promise<{
      id: string
      status: string
      items: { data: Array<{ id: string; price: { id: string } }> }
    }>
    update(id: string, params: Record<string, unknown>): Promise<{ pending_update?: unknown | null }>
  }
}

const SWITCHABLE_STATUSES = ['active', 'trialing']

export type SwitchResult = 'UPDATED' | 'PENDING_PAYMENT' | 'SAME_PLAN' | 'PAYMENT_ISSUE' | 'NO_ACTIVE'

function isMissing(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number }
  return e?.code === 'resource_missing' || e?.statusCode === 404
}

/**
 * Switches a live subscription to `priceId`. Returns NO_ACTIVE only when the
 * subscription is over or unknown to Stripe; any other Stripe error is thrown,
 * so the caller never opens a second Checkout on a transient failure.
 */
export async function switchExistingSubscription(
  stripe: SubscriptionApi,
  subscriptionId: string,
  priceId: string,
  metadata: Record<string, string>,
): Promise<SwitchResult> {
  let subscription
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId)
  } catch (err) {
    if (isMissing(err)) return 'NO_ACTIVE'
    throw err
  }
  if (subscription.status === 'past_due' || subscription.status === 'unpaid' || subscription.status === 'incomplete') {
    return subscription.status === 'unpaid' ? 'NO_ACTIVE' : 'PAYMENT_ISSUE'
  }
  if (!SWITCHABLE_STATUSES.includes(subscription.status)) return 'NO_ACTIVE'

  const item = subscription.items.data[0]
  if (!item) return 'NO_ACTIVE'
  if (item.price.id === priceId) return 'SAME_PLAN'

  const updated = await stripe.subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: 'always_invoice',
    payment_behavior: 'pending_if_incomplete',
  })
  if (updated.pending_update) return 'PENDING_PAYMENT'

  // Metadata is not accepted together with pending_if_incomplete.
  await stripe.subscriptions.update(subscription.id, { metadata })
  return 'UPDATED'
}
