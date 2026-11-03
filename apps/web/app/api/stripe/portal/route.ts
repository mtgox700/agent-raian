/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session.
 * Returns { url: string }: redirect the user to manage their subscription.
 *
 * Body: { workspaceId: string }
 */

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe/client'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { DELETION_PENDING_BILLING } from '@/lib/privacy/workspace-deletion'

const bodySchema = z.object({
  workspaceId: z.string().min(1),
})

export async function POST(req: Request) {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return Response.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    const raw = await req.json() as unknown
    body = bodySchema.parse(raw)
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const { workspaceId } = body

  // Billing is the owner's: billing.manage on this workspace.
  const access = await requireAccess(clerkId, 'billing.manage', { workspaceId })
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status })
  const workspace = await db.workspace.findUnique({
    where:  { id: access.ctx.workspaceId },
    select: { id: true, stripeCustomerId: true, deletionScheduledFor: true },
  })

  if (!workspace) {
    return Response.json({ error: 'Espace de travail introuvable.' }, { status: 404 })
  }
  // The subscription must not renew nor start while the workspace waits
  // for its deletion: cancelling the deletion restores billing.
  if (workspace.deletionScheduledFor) {
    return Response.json({ error: DELETION_PENDING_BILLING }, { status: 409 })
  }

  if (!workspace.stripeCustomerId) {
    return Response.json({ error: 'Aucun abonnement à gérer : choisissez une formule.' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://phantera-tn.com'

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/settings?tab=billing`,
    })
    return Response.json({ url: portalSession.url })
  } catch (err) {
    console.error('[stripe/portal] session creation failed', {
      workspaceId: workspace.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Stripe est momentanément indisponible. Réessayez dans un instant.' }, { status: 502 })
  }
}
