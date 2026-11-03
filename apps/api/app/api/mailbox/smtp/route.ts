/**
 * POST /api/mailbox/smtp
 *
 * Save a custom SMTP mailbox after testing connectivity.
 * Body: { workspaceId, host, port, secure, email, password, displayName? }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/security/crypto'
import { testSmtpConnection } from '@/lib/email/smtp-client'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { requireStepUp } from '@/lib/auth/step-up'
import { recordAudit } from '@/lib/audit/audit'
import { canConnectMailbox, canonicalMailboxEmail, connectWithinQuota, connectorOf } from '@/lib/email/mailbox-access'
import { tooManyRequests } from '@/lib/security/rate-limit'
import { ipKey, limit, limitAll } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  workspaceId: z.string().cuid(),
  host:        z.string().min(1).max(253),
  port:        z.number().int().min(1).max(65535).default(587),
  secure:      z.boolean().default(true),
  email:       z.string().email(),
  password:    z.string().min(1),
  displayName: z.string().max(100).optional(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Rate limit: prevent brute-force on SMTP credentials, per account and per IP
  // (the workspace is checked below, once the body names it).
  const rl = await limitAll([
    { key: `user:${userId}`, opts: { windowSec: 60, max: 5, scope: 'smtp:connect' } },
    { key: ipKey(req), opts: { windowSec: 60, max: 10, scope: 'smtp:connect' } },
  ])
  if (!rl.allowed) return tooManyRequests(rl, 5) as NextResponse

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 422 })
  }

  const workspaceAccess = await requireAccess(userId, 'mailbox.connect', { workspaceId: body.workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const perWorkspace = await limit(`ws:${workspace.workspaceId}`, { windowSec: 3600, max: 30, scope: 'smtp:connect' })
  if (!perWorkspace.allowed) return tooManyRequests(perWorkspace, 30) as NextResponse
  const stepUp = await requireStepUp(db, workspace, { deny: { action: 'mailbox.connected', target: { type: 'mailbox', id: null }, req, details: { provider: 'SMTP' } } })
  if (stepUp) return stepUp

  // A new mailbox needs room in the plan; reconnecting an existing one does not.
  const mailboxEmail = await canonicalMailboxEmail(db, body.workspaceId, body.email)
  // Early answer before testing the server; the write below re-checks under a lock.
  const access = await canConnectMailbox(db, body.workspaceId, mailboxEmail, connectorOf(workspace))
  if (!access.allowed) return NextResponse.json({ error: access.message }, { status: 403 })

  // Test connection before saving. (A NextResponse used to be thrown from this
  // catch, which surfaced as a 500 instead of the provider's message.)
  try {
    await testSmtpConnection({
      host:     body.host,
      port:     body.port,
      secure:   body.secure,
      user:     body.email,
      password: body.password,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Connexion SMTP échouée' },
      { status: 400 },
    )
  }

  const connected = await connectWithinQuota(db, body.workspaceId, mailboxEmail, connectorOf(workspace), (tx) => tx.connectedMailbox.upsert({
    where:  { workspaceId_email: { workspaceId: body.workspaceId, email: mailboxEmail } },
    create: {
      workspaceId:     body.workspaceId,
      ownerUserId:     workspace.userId,
      provider:        'SMTP',
      email:           mailboxEmail,
      displayName:     body.displayName,
      accessTokenEnc:  encrypt('smtp'),  // placeholder — SMTP uses smtpPasswordEnc
      smtpHost:        body.host,
      smtpPort:        body.port,
      smtpSecure:      body.secure,
      smtpPasswordEnc: encrypt(body.password),
      status:          'CONNECTED',
      isDefault:       false,
    },
    update: {
      smtpHost:        body.host,
      smtpPort:        body.port,
      smtpSecure:      body.secure,
      smtpPasswordEnc: encrypt(body.password),
      displayName:     body.displayName,
      status:          'CONNECTED',
      lastSyncError:   null,
    },
  }))
  if (!connected.allowed) return NextResponse.json({ error: connected.message }, { status: 403 })
  const mailbox = connected.result
  await recordAudit(db, workspace, { action: 'mailbox.connected', target: { type: 'mailbox', id: mailbox.id }, req, details: { provider: 'SMTP' } })

  return NextResponse.json({
    id:          mailbox.id,
    email:       mailbox.email,
    provider:    mailbox.provider,
    status:      mailbox.status,
    displayName: mailbox.displayName,
  })
}
