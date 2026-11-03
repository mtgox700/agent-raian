/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for plan upgrade.
 * Accepts plan name (PRO | BUSINESS | ENTERPRISE) + billing cycle.
 * Price IDs stay server-side only: client never sees them.
 *
 * Returns { url: string }: redirect the user to this URL.
 *
 * Body: { plan: 'PRO' | 'BUSINESS' | 'ENTERPRISE',
 *         billing?: 'monthly' | 'annual'  (default 'monthly'),
 *         workspaceId: string }
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe/client'
import { getOrCreateStripeCustomer, syncSubscriptionToWorkspace } from '@/lib/stripe/sync'
import { switchExistingSubscription, type SubscriptionApi } from '@/lib/stripe/change-plan'
import { resolvePriceId } from '@/lib/stripe/plans'
import { db } from '@/lib/db'
import { getClientKey, tooManyRequests } from '@/lib/security/rate-limit'
import { limit } from '@/lib/security/shared-rate-limit'
import { requireAccess } from '@/lib/auth/access'
import { DELETION_PENDING_BILLING } from '@/lib/privacy/workspace-deletion'

const bodySchema = z.object({
  // ENTERPRISE is sold by the team, never through self-serve checkout.
  plan:        z.enum(['PRO', 'BUSINESS']),
  billing:     z.enum(['monthly', 'annual']).default('monthly'),
  workspaceId: z.string().min(1),
})

export async function POST(req: Request) {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return Response.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  }

  // Rate-limit checkout attempts: 5 per minute per user.
  // Blocks card-stuffing / brute-force checkout abuse.
  const limitOpts = { windowSec: 60, max: 5, scope: 'stripe:checkout' }
  const limitResult = await limit(getClientKey(req, clerkId), limitOpts)
  if (!limitResult.allowed) {
    return tooManyRequests(limitResult, limitOpts.max)
  }

  let body: z.infer<typeof bodySchema>
  try {
    const raw = await req.json() as unknown
    body = bodySchema.parse(raw)
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const { plan, billing, workspaceId } = body

  // Resolve price ID server-side (never exposed to client)
  const priceId = resolvePriceId(plan, billing)
  if (!priceId) {
    // Configuration detail stays in the logs, not in the response.
    console.error(`[checkout] missing Stripe price for ${plan} (${billing})`)
    return Response.json(
      { error: "Cette formule n'est pas disponible pour le moment. Contactez-nous." },
      { status: 500 }
    )
  }

  // Billing is the owner's: billing.manage on this workspace.
  const access = await requireAccess(clerkId, 'billing.manage', { workspaceId })
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status })
  const workspace = await db.workspace.findUnique({
    where:  { id: access.ctx.workspaceId },
    select: { id: true, name: true, stripeCustomerId: true, stripeSubscriptionId: true, deletionScheduledFor: true },
  })

  if (!workspace) {
    return Response.json({ error: 'Espace de travail introuvable.' }, { status: 404 })
  }
  // The subscription must not renew nor start while the workspace waits
  // for its deletion: cancelling the deletion restores billing.
  if (workspace.deletionScheduledFor) {
    return Response.json({ error: DELETION_PENDING_BILLING }, { status: 409 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://phantera-tn.com'
  const successUrl = `${baseUrl}/dashboard/settings?tab=billing&billing=success`

  // Already paying: switch the live subscription (prorated) instead of
  // opening a second one that would be charged on top of it.
  if (workspace.stripeSubscriptionId) {
    let switched
    try {
      switched = await switchExistingSubscription(
        stripe as unknown as SubscriptionApi,
        workspace.stripeSubscriptionId,
        priceId,
        { workspaceId, plan, billing },
      )
    } catch (err) {
      // Never fall back to a new Checkout when Stripe could not be read: that
      // is how a second, double-billed subscription gets created.
      console.error('[checkout] plan switch failed:', err instanceof Error ? err.message : String(err))
      return Response.json({ error: 'Stripe est momentanément indisponible. Réessayez dans un instant.' }, { status: 502 })
    }
    if (switched === 'SAME_PLAN') {
      return Response.json({ error: 'Vous êtes déjà sur cette formule.' }, { status: 409 })
    }
    if (switched === 'PAYMENT_ISSUE') {
      return Response.json(
        { error: 'Un paiement est en attente sur votre abonnement. Mettez à jour votre moyen de paiement avant de changer de formule.', reason: 'payment_issue' },
        { status: 409 },
      )
    }
    if (switched === 'UPDATED' || switched === 'PENDING_PAYMENT') {
      // The plan follows Stripe: an upgrade waiting for its payment keeps the
      // current plan until the invoice is paid (webhook then syncs again).
      await syncSubscriptionToWorkspace(workspace.stripeSubscriptionId, workspaceId)
      return Response.json({ url: successUrl })
    }
  }

  // Get the user's email for Stripe customer
  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''
  const name = clerkUser?.fullName ?? workspace.name

  // Get or create Stripe customer
  const customerId = await getOrCreateStripeCustomer(workspaceId, email, name)

  // VAT: Stripe Tax computes it and collects the customer's VAT number. Only
  // when enabled on the Stripe account, otherwise Checkout rejects the session.
  const taxEnabled = process.env.STRIPE_TAX_ENABLED === '1'

  // Create Stripe Checkout session.
  // metadata.plan + metadata.billing are surfaced to the webhook so analytics
  // (checkout_completed event) can record both dimensions accurately.
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { workspaceId, plan, billing },
    success_url: successUrl,
    cancel_url:  `${baseUrl}/dashboard/settings?tab=billing`,
    subscription_data: { metadata: { workspaceId, plan, billing } },
    allow_promotion_codes: true,
    ...(taxEnabled && {
      automatic_tax:        { enabled: true },
      tax_id_collection:    { enabled: true },
      customer_update:      { address: 'auto', name: 'auto' },
    }),
  })

  return Response.json({ url: session.url })
}
