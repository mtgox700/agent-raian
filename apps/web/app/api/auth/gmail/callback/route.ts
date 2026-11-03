/**
 * GET /api/auth/gmail/callback?code=…&state=…
 *
 * Google OAuth 2.0 callback handler.
 * Exchanges the authorization code for tokens, fetches user email,
 * encrypts tokens, and saves the ConnectedMailbox to DB.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/security/crypto'
import { verifyOAuthState } from '@/lib/security/oauth-state'
import { requireAccess } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/audit'
import { canonicalMailboxEmail, connectWithinQuota, connectorOf } from '@/lib/email/mailbox-access'
import { syncGmailAliases } from '@/lib/email/gmail-aliases'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://phantera-tn.com'
const REDIRECT_SUCCESS = `${BASE_URL}/dashboard/settings?mailbox=connected`
const REDIRECT_ERROR   = `${BASE_URL}/dashboard/settings?mailbox=error`

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(`${REDIRECT_ERROR}&reason=${encodeURIComponent(error ?? 'missing_code')}`)
  }

  const stateCheck = verifyOAuthState(state)
  if (!stateCheck.ok || !stateCheck.payload) {
    return NextResponse.redirect(`${REDIRECT_ERROR}&reason=invalid_state_${stateCheck.reason ?? 'unknown'}`)
  }
  const { workspaceId, userId } = stateCheck.payload

  // The account finishing the consent must be the one that started it:
  // otherwise someone could make a victim approve their own link and bring
  // the victim's mailbox into their workspace (OAuth login CSRF).
  const { userId: sessionUserId } = await auth()
  if (!sessionUserId || sessionUserId !== userId) {
    return NextResponse.redirect(`${REDIRECT_ERROR}&reason=unauthorized`)
  }

  // Verify the user owns this workspace
  const workspaceAccess = await requireAccess(userId, 'mailbox.connect', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) {
    return NextResponse.redirect(`${REDIRECT_ERROR}&reason=unauthorized`)
  }
  const workspace = workspaceAccess.ctx

  // Exchange code for tokens
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${BASE_URL}/api/auth/gmail/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${REDIRECT_ERROR}&reason=token_exchange_failed`)
  }

  const tokens = await tokenRes.json() as {
    access_token:  string
    refresh_token?: string
    expires_in:    number
    token_type:    string
  }

  // Fetch user email from Google
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userRes.ok) {
    return NextResponse.redirect(`${REDIRECT_ERROR}&reason=userinfo_failed`)
  }

  const userInfo = await userRes.json() as {
    email?:           string | null
    verified_email?:  boolean
    name?:            string
    id?:              string
  }

  // CRITICAL: Google may return null email if user revoked the email scope
  // between consent and callback, OR if account has no primary email visible.
  // Guard with a clean redirect instead of crashing on Prisma upsert.
  const email = userInfo.email?.toLowerCase().trim()
  if (!email) {
    return NextResponse.redirect(`${REDIRECT_ERROR}&reason=no_email_on_account`)
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  const mailboxEmail = await canonicalMailboxEmail(db, workspaceId, email)

  // A new mailbox needs room in the plan; reconnecting an existing one does
  // not. Checked and written together so the plan limit holds.
  const connected = await connectWithinQuota(db, workspaceId, mailboxEmail, connectorOf(workspace), (tx) => tx.connectedMailbox.upsert({
    where:  { workspaceId_email: { workspaceId, email: mailboxEmail } },
    create: {
      workspaceId,
      ownerUserId:     workspace.userId,
      provider:        'GMAIL',
      email:           mailboxEmail,
      displayName:     userInfo.name,
      accessTokenEnc:  encrypt(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenExpiresAt:  expiresAt,
      status:          'CONNECTED',
      isDefault:       false,
    },
    update: {
      accessTokenEnc:  encrypt(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokenExpiresAt:  expiresAt,
      status:          'CONNECTED',
      lastSyncError:   null,
      displayName:     userInfo.name,
    },
    select: { id: true },
  }))
  if (!connected.allowed) return NextResponse.redirect(`${REDIRECT_ERROR}&reason=${connected.taken ? 'mailbox_taken' : 'mailbox_limit'}`)
  const mailbox = connected.result
  await recordAudit(db, workspaceAccess.ctx, { action: 'mailbox.connected', target: { type: 'mailbox', id: mailbox.id }, req, details: { provider: 'GMAIL' } })

  // Its « Envoyer en tant que » aliases, read now so they can be picked for a
  // campaign right away. Best effort: they can be refreshed from the settings.
  await syncGmailAliases(db, mailbox.id, tokens.access_token).catch((err: unknown) => {
    console.warn('[gmail-callback] alias sync skipped:', err instanceof Error ? err.message : err)
  })

  return NextResponse.redirect(REDIRECT_SUCCESS)
}
