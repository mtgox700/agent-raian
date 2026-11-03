/**
 * Phantera: Stripe subscription sync
 *
 * Syncs a Stripe subscription to the corresponding Workspace record.
 * Called from the webhook handler after any subscription lifecycle event.
 * Idempotent: safe to call multiple times for the same subscription state.
 */

import { stripe } from './client'
import { getPlanByPriceId, getPlanLimits } from './plans'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit/audit'
import type { Plan } from '@prisma/client'

// ─── Plan downgrade enforcement ──────────────────────────────────────────────

/**
 * After a plan change, pause active campaigns that exceed the new plan's
 * campaign limit. Non-destructive: we PAUSE (not delete) the oldest-active
 * excess so sending stops: the user keeps their data and can reactivate after
 * re-upgrading. Closes the downgrade revenue leak (running campaigns without
 * paying). No-op for unlimited plans.
 */
async function enforceCampaignLimit(workspaceId: string): Promise<void> {
  const ws = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { plan: true },
  })
  if (!ws) return

  const limit = getPlanLimits(ws.plan).campaignsLimit
  if (limit === Infinity) return

  // Keep the most recently active campaigns running; pause the rest.
  const active = await db.campaign.findMany({
    where:   { workspaceId, status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    select:  { id: true },
  })
  if (active.length <= limit) return

  const toPause = active.slice(limit).map((c) => c.id)
  await db.campaign.updateMany({
    where: { id: { in: toPause } },
    data:  { status: 'PAUSED' },
  })
  console.log(`[plan-enforce] workspace ${workspaceId} -> ${ws.plan}: paused ${toPause.length} campaign(s) over limit ${limit}`)
}

// ─── Sync subscription -> Workspace ───────────────────────────────────────────

export async function syncSubscriptionToWorkspace(
  subscriptionId: string,
  workspaceId?: string // optional override (used in checkout.session.completed)
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method'],
  })

  const firstItem = subscription.items.data[0]
  const priceId = firstItem?.price.id ?? null
  const plan: Plan = priceId ? (getPlanByPriceId(priceId) ?? 'FREE') : 'FREE'

  // past_due = Stripe is still retrying the payment (Smart Retries + reminder
  // emails): the customer keeps the plan during this grace period. Only when
  // Stripe gives up (unpaid / canceled) does the workspace fall back to FREE.
  const isActive = ['active', 'trialing', 'past_due'].includes(subscription.status)
  const resolvedPlan: Plan = isActive ? plan : 'FREE'

  // In Stripe v22 (dahlia), current_period_end moved to SubscriptionItem
  const periodEndTimestamp = firstItem?.current_period_end ?? null
  const periodEnd = periodEndTimestamp ? new Date(periodEndTimestamp * 1000) : null

  // Find the workspace: by explicit ID, or by stripeSubscriptionId
  const whereClause = workspaceId
    ? { id: workspaceId }
    : { stripeSubscriptionId: subscriptionId }

  // Two checkouts completed in parallel (two tabs on a first purchase): the
  // subscription being replaced would keep billing with nobody tracking it.
  if (workspaceId) await cancelSupersededSubscription(workspaceId, subscriptionId)

  const before = await db.workspace.findFirst({ where: whereClause, select: { id: true, plan: true } })
  await db.workspace.updateMany({
    where: whereClause,
    data: {
      plan: resolvedPlan,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: periodEnd,
    },
  })

  // Enforce the (possibly lower) plan's campaign limit after the change.
  const target = await db.workspace.findFirst({ where: whereClause, select: { id: true } })
  if (before && before.plan !== resolvedPlan) {
    await recordAudit(db, { workspaceId: before.id, userId: null }, {
      action: 'plan.changed', target: { type: 'subscription', id: subscriptionId },
      details: { from: before.plan, to: resolvedPlan, status: subscription.status },
    })
  }
  if (target) await enforceCampaignLimit(target.id)
}

async function cancelSupersededSubscription(workspaceId: string, newSubscriptionId: string): Promise<void> {
  const current = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { stripeSubscriptionId: true },
  })
  const previousId = current?.stripeSubscriptionId
  if (!previousId || previousId === newSubscriptionId) return
  try {
    const previous = await stripe.subscriptions.retrieve(previousId)
    if (['active', 'trialing', 'past_due'].includes(previous.status)) {
      await stripe.subscriptions.cancel(previousId)
      console.warn(`[stripe-sync] cancelled superseded subscription ${previousId} for workspace ${workspaceId}`)
    }
  } catch (err) {
    console.error(`[stripe-sync] could not cancel superseded subscription ${previousId}:`, err instanceof Error ? err.message : String(err))
  }
}

// ─── Reset workspace to free ──────────────────────────────────────────────────

export async function resetWorkspaceTofree(
  workspaceId: string
): Promise<void> {
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      plan: 'FREE',
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
    },
  })

  // FREE allows 1 campaign: pause any excess so cancelled users stop sending.
  await enforceCampaignLimit(workspaceId)
}

// ─── Ensure Stripe customer exists for a workspace ───────────────────────────

export async function getOrCreateStripeCustomer(
  workspaceId: string,
  email: string,
  name?: string
): Promise<string> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { stripeCustomerId: true },
  })

  if (workspace?.stripeCustomerId) {
    return workspace.stripeCustomerId
  }

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { workspaceId },
  })

  // Persist
  await db.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}
