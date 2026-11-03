/**
 * POST /api/mailbox/aliases: manage the aliases of a mailbox.
 * Body: { action: 'sync', mailboxId }                       Gmail: re-read « Envoyer en tant que »
 *       { action: 'add', mailboxId, email, displayName? }   SMTP: add an address of the same domain
 *       { action: 'remove', mailboxId, email }              SMTP: remove one
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { ownMailboxScope } from '@/lib/auth/scope'
import { limit } from '@/lib/security/shared-rate-limit'
import { addSmtpAlias, removeSmtpAlias, syncGmailAliases } from '@/lib/email/gmail-aliases'
import { GmailAliasError } from '@/lib/email/sender-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync'), mailboxId: z.string().min(1).max(64) }),
  z.object({
    action:      z.literal('add'),
    mailboxId:   z.string().min(1).max(64),
    email:       z.string().min(3).max(254),
    displayName: z.string().max(80).optional(),
  }),
  z.object({ action: z.literal('remove'), mailboxId: z.string().min(1).max(64), email: z.string().min(3).max(254) }),
])

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const workspaceAccess = await requireAccess(userId, 'mailbox.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const throttle = await limit(`aliases:${workspace.workspaceId}`, { windowSec: 60, max: 20, scope: 'mailbox-aliases' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop de modifications : réessayez dans une minute.' }, { status: 429 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  const body = parsed.data

  // A member changes the aliases of their own mailboxes only; admins of any.
  const mailbox = await db.connectedMailbox.findFirst({
    where:  { id: body.mailboxId, ...ownMailboxScope(workspace) },
    select: { id: true, provider: true, status: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'Boîte introuvable.' }, { status: 404 })

  if (body.action === 'sync') {
    if (mailbox.provider !== 'GMAIL') return NextResponse.json({ error: 'Seuls les alias Gmail se synchronisent.' }, { status: 400 })
    if (mailbox.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Reconnectez cette boîte avant de lire ses alias.' }, { status: 409 })
    }
    try {
      const aliases = await syncGmailAliases(db, mailbox.id)
      return NextResponse.json({ ok: true, aliases })
    } catch (err) {
      const status = err instanceof GmailAliasError ? err.status : 0
      console.warn(`[mailbox/aliases] Gmail sync failed for ${mailbox.id}:`, err instanceof Error ? err.message : err)
      const error = status === 401 || status === 403
        ? 'Gmail refuse la lecture des alias : reconnectez la boîte.'
        : 'Gmail ne répond pas : réessayez dans un instant.'
      return NextResponse.json({ error }, { status: 502 })
    }
  }

  const result = body.action === 'add'
    ? await addSmtpAlias(db, workspace.workspaceId, body.mailboxId, { email: body.email, displayName: body.displayName })
    : await removeSmtpAlias(db, workspace.workspaceId, body.mailboxId, body.email)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, aliases: result.aliases, releasedCampaigns: result.releasedCampaigns })
}
