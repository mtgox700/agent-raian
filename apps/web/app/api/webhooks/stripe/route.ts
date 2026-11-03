/**
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events. Uses raw body for signature verification.
 *
 * Events handled:
 *   - checkout.session.completed    -> link customer, sync subscription
 *   - customer.subscription.updated -> sync subscription to workspace
 *   - customer.subscription.deleted -> reset workspace to FREE
 *   - invoice.payment_failed        -> log only (Stripe retries automatically)
 */

import { stripe } from '@/lib/stripe/client'
import { syncSubscriptionToWorkspace, resetWorkspaceTofree } from '@/lib/stripe/sync'
import { db } from '@/lib/db'
import { trackServer, flushServerEvents } from '@/lib/analytics/server-events'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Raw body required for signature verification
  const buf = Buffer.from(await req.arrayBuffer())
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured')
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed'
    console.error('[Stripe Webhook] Signature error:', message)
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Dispatch by event type
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        // Acknowledge silently: we don't process this event type
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Event processing failed'
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, message)
    // Return 500 so Stripe retries the event
    return Response.json({ error: 'Event processing failed' }, { status: 500 })
  }

  return Response.json({ received: true })
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const workspaceId = session.metadata?.workspaceId
  if (!workspaceId) {
    console.error('[Stripe Webhook] checkout.session.completed: missing workspaceId in metadata')
    return
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id

  if (!customerId || !subscriptionId) {
    console.error('[Stripe Webhook] checkout.session.completed: missing customer or subscription')
    return
  }

  // Link customer to workspace + capture owner for analytics
  const workspace = await db.workspace.update({
    where: { id: workspaceId },
    data:  { stripeCustomerId: customerId },
    select: {
      plan:  true,
      owner: { select: { clerkId: true } },
    },
  })

  // Sync subscription state
  await syncSubscriptionToWorkspace(subscriptionId, workspaceId)

  // ── Analytics: revenue milestone ──
  // We fire AFTER sync so the workspace.plan reflects the new plan, but we
  // read the new plan from session metadata to avoid an extra DB roundtrip.
  const metaPlan = session.metadata?.plan
  const plan: 'PRO' | 'BUSINESS' | 'ENTERPRISE' =
    metaPlan === 'BUSINESS' || metaPlan === 'ENTERPRISE' ? metaPlan : 'PRO'
  if (workspace.owner?.clerkId) {
    trackServer(workspace.owner.clerkId, 'checkout_completed', {
      workspaceId,
      plan,
      amount: typeof session.amount_total === 'number'
        ? session.amount_total / 100
        : undefined,
    })
    await flushServerEvents()
  }

  console.log(`[Stripe Webhook] ✓ Checkout completed: workspace ${workspaceId} -> subscription ${subscriptionId}`)
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  await syncSubscriptionToWorkspace(subscription.id)
  console.log(`[Stripe Webhook] ✓ Subscription updated: ${subscription.id} -> ${subscription.status}`)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Find workspace + owner clerkId so we can fire the cancellation event
  const workspace = await db.workspace.findFirst({
    where:  { stripeSubscriptionId: subscription.id },
    select: {
      id:    true,
      plan:  true,
      owner: { select: { clerkId: true } },
    },
  })

  if (!workspace) {
    console.warn(`[Stripe Webhook] subscription.deleted: no workspace found for ${subscription.id}`)
    return
  }

  const previousPlan = workspace.plan // capture before reset
  await resetWorkspaceTofree(workspace.id)

  // ── Analytics: churn milestone ──
  if (workspace.owner?.clerkId) {
    trackServer(workspace.owner.clerkId, 'subscription_cancelled', {
      workspaceId:  workspace.id,
      previousPlan: previousPlan,
    })
    await flushServerEvents()
  }

  console.log(`[Stripe Webhook] ✓ Subscription cancelled: workspace ${workspace.id} reset to FREE`)
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Log only: Stripe automatically retries, and we don't downgrade immediately
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  console.warn(`[Stripe Webhook] Payment failed for customer ${customerId}: invoice ${invoice.id}`)
  // TODO: send notification email to workspace owner via Resend
}
