/**
 * GET /api/auth/outlook/callback?code=…&state=…
 * Microsoft OAuth 2.0 callback: exchanges code, saves ConnectedMailbox.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/security/crypto'
import { verifyOAuthState } from '@/lib/security/oauth-state'
import { requireAccess } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/audit'
import { canonicalMailboxEmail, connectWithinQuota, connectorOf } from '@/lib/email/mailbox-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL       = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://phantera-tn.com'
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
  const workspaceAccess = await requireAccess(userId, 'mailbox.connect', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return NextResponse.redirect(`${REDIRECT_ERROR}&reason=unauthorized`)
  const workspace = workspaceAccess.ctx

  const tenantId   = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
    ?? `${BASE_URL}/api/auth/outlook/callback`

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri:  redirectUri,
        code,
        grant_type:    'authorization_code',
        scope:         'Mail.Send Mail.Read User.Read offline_access',
      }),
    },
  )

  if (!tokenRes.ok) return NextResponse.redirect(`${REDIRECT_ERROR}&reason=token_exchange_failed`)

  const tokens = await tokenRes.json() as {
    access_token:  string
    refresh_token?: string
    expires_in:    number
  }

  // Get user's email from Microsoft Graph.
  // CRITICAL: For personal Microsoft accounts (@outlook.com, @hotmail.com),
  // `mail` is null: only `userPrincipalName` has a value. We also fetch
  // `userPrincipalName` and `id` as fallbacks for any non-standard account.
  const userRes = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName,id',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  )
  if (!userRes.ok) return NextResponse.redirect(`${REDIRECT_ERROR}&reason=userinfo_failed`)

  const userInfo = await userRes.json() as {
    mail:              string | null
    userPrincipalName: string | null
    displayName?:      string
    id?:               string
  }

  const email = userInfo.mail ?? userInfo.userPrincipalName
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
      provider:        'OUTLOOK',
      email:           mailboxEmail,
      displayName:     userInfo.displayName,
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
    },
    select: { id: true },
  }))
  if (!connected.allowed) return NextResponse.redirect(`${REDIRECT_ERROR}&reason=${connected.taken ? 'mailbox_taken' : 'mailbox_limit'}`)
  await recordAudit(db, workspace, { action: 'mailbox.connected', target: { type: 'mailbox', id: connected.result.id }, req, details: { provider: 'OUTLOOK' } })

  return NextResponse.redirect(REDIRECT_SUCCESS)
}
