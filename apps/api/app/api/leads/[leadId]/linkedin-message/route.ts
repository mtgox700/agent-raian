/**
 * POST /api/leads/[leadId]/linkedin-message
 *
 * Sends a one-off LinkedIn DM to a lead through the workspace's connected
 * Unipile account (manual action from the lead detail drawer). Same doctrine
 * as sequence sends: if the account cannot DM a non-connection (403
 * subscription_required), falls back to a connection invitation carrying the
 * message as the note.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { leadScope, sendableBy } from '@/lib/auth/scope'
import { limitAll } from '@/lib/security/shared-rate-limit'
import {
  isUnipileConfigured,
  linkedInPublicIdentifier,
  resolveLinkedInProviderId,
  sendLinkedInMessage,
  sendLinkedInInvitation,
} from '@/lib/multichannel/unipile'

const bodySchema = z.object({
  message: z.string().trim().min(1, 'Message vide').max(1500, 'Message trop long (1500 caractères max)'),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const workspaceAccess = await requireAccess(userId, 'lead.write')
    if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
    const workspace = workspaceAccess.ctx
    // A LinkedIn account sending in bulk gets restricted: same pace as sequences.
    const throttle = await limitAll([
      { key: `user:${workspace.userId}`, opts: { windowSec: 3600, max: 30, scope: 'linkedin-manual' } },
      { key: `user:${workspace.userId}`, opts: { windowSec: 86_400, max: 80, scope: 'linkedin-manual-day' } },
    ])
    if (!throttle.allowed) return NextResponse.json({ error: 'Limite d’envois LinkedIn atteinte pour le moment : réessayez plus tard.' }, { status: 429 })

    if (!isUnipileConfigured()) {
      return NextResponse.json({ error: 'Canal LinkedIn non configuré côté serveur' }, { status: 503 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide' }, { status: 400 })
    }

    const { leadId } = await params
    const lead = await db.lead.findFirst({
      where:  { AND: [{ id: leadId }, leadScope(workspace)] },
      select: { id: true, linkedinUrl: true, doNotContact: true },
    })
    if (!lead) return NextResponse.json({ error: 'Lead introuvable' }, { status: 404 })
    if (lead.doNotContact) {
      return NextResponse.json({ error: 'Ce lead est marqué "ne pas contacter"' }, { status: 409 })
    }
    if (!lead.linkedinUrl) {
      return NextResponse.json({ error: 'Ce lead n\'a pas de profil LinkedIn' }, { status: 422 })
    }

    // Sent as the person clicking: their LinkedIn, or one shared with the team.
    const channel = await db.connectedChannel.findFirst({
      where:   { workspaceId: workspace.workspaceId, provider: 'LINKEDIN', status: 'CONNECTED', ...sendableBy(workspace.userId) },
      orderBy: { sharedWithTeam: 'asc' },
      select:  { unipileAccountId: true },
    })
    if (!channel?.unipileAccountId) {
      return NextResponse.json(
        { error: 'Aucun compte LinkedIn connecté (Paramètres, onglet E-mails et canaux)' },
        { status: 409 },
      )
    }

    const publicId = linkedInPublicIdentifier(lead.linkedinUrl)
    if (!publicId) {
      return NextResponse.json({ error: `URL LinkedIn invalide: ${lead.linkedinUrl}` }, { status: 422 })
    }
    const providerId = await resolveLinkedInProviderId(channel.unipileAccountId, publicId)
    if (!providerId) {
      return NextResponse.json({ error: 'Profil LinkedIn introuvable via le compte connecté' }, { status: 422 })
    }

    try {
      await sendLinkedInMessage({
        accountId:           channel.unipileAccountId,
        recipientProviderId: providerId,
        text:                parsed.data.message,
      })
      return NextResponse.json({ ok: true, via: 'dm' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const notConnected =
        msg.includes('subscription_required')
        || msg.includes('no_connection_with_recipient')
        || msg.includes('(403)')
      if (!notConnected) throw err
      // Not connected + free account -> invitation with the message as note.
      await sendLinkedInInvitation({
        accountId:           channel.unipileAccountId,
        recipientProviderId: providerId,
        note:                parsed.data.message,
      })
      return NextResponse.json({ ok: true, via: 'invitation' })
    }
  } catch (err: unknown) {
    console.error('[linkedin-message] FAILED:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'L’envoi LinkedIn n’a pas abouti : réessayez dans un instant.' }, { status: 502 })
  }
}
