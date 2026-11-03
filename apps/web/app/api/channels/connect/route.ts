/**
 * POST /api/channels/connect: start connecting a LinkedIn/WhatsApp channel.
 *
 * Creates a PENDING ConnectedChannel row, then returns a Unipile hosted-auth
 * URL the client redirects the user to. Unipile calls back
 * /api/webhooks/unipile with our row id (echoed via `name`) once the account
 * is live; the webhook flips the row to CONNECTED.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { requireStepUp } from '@/lib/auth/step-up'
import { createHostedAuthLink, isUnipileConfigured } from '@/lib/multichannel/unipile'
import { unipileWebhookUrl } from '@/lib/multichannel/webhook-auth'

export const runtime = 'nodejs'

const bodySchema = z.object({
  provider: z.enum(['LINKEDIN', 'WHATSAPP']),
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isUnipileConfigured()) {
    return NextResponse.json(
      { error: 'Multicanal non configuré côté serveur (UNIPILE_DSN / UNIPILE_API_KEY).' },
      { status: 503 },
    )
  }

  const workspaceAccess = await requireAccess(userId, 'channel.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Canal invalide.' }, { status: 400 })
  }
  const { provider } = parsed.data
  const stepUp = await requireStepUp(db, workspace, { deny: { action: 'channel.connected', target: { type: 'channel', id: null }, req, details: { provider } } })
  if (stepUp) return stepUp
  // An automated WhatsApp sender writes first to people who did not opt in,
  // which is what gets accounts banned. WhatsApp is reached through the
  // signature's click-to-chat link instead.
  if (provider === 'WHATSAPP') {
    return NextResponse.json(
      { error: "WhatsApp passe par le lien de votre signature : le prospect vous écrit en premier. Ajoutez votre numéro dans Paramètres, onglet E-mails et canaux, Signature." },
      { status: 400 },
    )
  }

  // ONE connected account per provider per member: a member's campaigns
  // send from their own LinkedIn (or one an admin shared), so a second
  // account of the same person would only create routing ambiguity.
  const alreadyConnected = await db.connectedChannel.findFirst({
    where: { workspaceId: workspace.workspaceId, ownerUserId: workspace.userId, provider, status: 'CONNECTED' },
  })
  if (alreadyConnected) {
    return NextResponse.json(
      { error: `Un compte ${provider === 'LINKEDIN' ? 'LinkedIn' : 'WhatsApp'} est déjà connecté. Déconnectez-le d'abord pour en lier un autre.` },
      { status: 409 },
    )
  }

  // A new attempt supersedes any previous unfinished one: drop stale PENDING
  // rows for this provider so the list never shows duplicate "waiting" entries
  // (founder-reported bug: clicking Connect twice showed 2 pending rows).
  await db.connectedChannel.deleteMany({
    where: { workspaceId: workspace.workspaceId, ownerUserId: workspace.userId, provider, status: 'PENDING' },
  })

  // PENDING row first: its id is our correlation key through the hosted flow.
  const channel = await db.connectedChannel.create({
    data: { workspaceId: workspace.workspaceId, ownerUserId: workspace.userId, provider, status: 'PENDING' },
  })

  const origin = new URL(req.url).origin
  try {
    const url = await createHostedAuthLink({
      provider,
      name: channel.id,
      successRedirectUrl: `${origin}/dashboard/settings?channel=connected`,
      failureRedirectUrl: `${origin}/dashboard/settings?channel=failed`,
      notifyUrl: unipileWebhookUrl(origin),
    })
    return NextResponse.json({ url, channelId: channel.id })
  } catch (err) {
    // Don't leave orphan PENDING rows if Unipile refused the link.
    await db.connectedChannel.delete({ where: { id: channel.id } }).catch(() => null)
    const message = err instanceof Error ? err.message : 'Erreur Unipile'
    console.error('[channels/connect]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
