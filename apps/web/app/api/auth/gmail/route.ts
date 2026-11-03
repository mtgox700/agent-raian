/**
 * GET /api/auth/gmail?workspaceId=…
 *
 * Initiates the Google OAuth 2.0 consent flow.
 * Redirects the user to Google's consent screen.
 *
 * Scopes requested:
 *   - gmail.send       : send emails on behalf of the user
 *   - gmail.readonly   : read replies to campaign emails (reply detection)
 *
 * gmail.modify is deliberately not requested: nothing modifies the mailbox,
 * and Google verification grants only the scopes the product really uses.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { signOAuthState } from '@/lib/security/oauth-state'
import { requireAccess } from '@/lib/auth/access'
import { checkStepUp } from '@/lib/auth/step-up'
import { db } from '@/lib/db'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  // Never start a consent flow for a workspace the user cannot connect mailboxes to.
  const access = await requireAccess(userId, 'mailbox.connect', { workspaceId })
  if (!access.ok) {
    return NextResponse.redirect(new URL('/dashboard/settings?mailbox=error&reason=unauthorized', req.url))
  }
  // The settings page verifies the session (useStepUp) before navigating
  // here; this is the server-side check of the same rule.
  const stepUp = await checkStepUp(db, access.ctx)
  if (stepUp !== 'OK') {
    return NextResponse.redirect(new URL(`/dashboard/settings?mailbox=error&reason=${stepUp === 'TWO_FACTOR_REQUIRED' ? 'two_factor_required' : 'reverify'}`, req.url))
  }

  const clientId    = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/gmail/callback`

  if (!clientId) return NextResponse.json({ error: 'Google OAuth non configuré' }, { status: 500 })

  // Pre-flight env check: signOAuthState requires ENCRYPTION_KEY. Failing early
  // here gives the user a clean error message instead of a silent 500 deep in
  // the callback after they completed the Google consent screen.
  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: 'Phantera n\'est pas correctement configuré (ENCRYPTION_KEY manquante). Contactez le support.' },
      { status: 500 },
    )
  }

  // Signed + time-limited state (10 min): prevents replay attacks.
  const state = signOAuthState(workspaceId, userId)

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id',     clientId)
  url.searchParams.set('redirect_uri',  redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope',         SCOPES)
  url.searchParams.set('access_type',   'offline')
  url.searchParams.set('prompt',        'consent')  // force refresh_token delivery
  url.searchParams.set('state',         state)

  return NextResponse.redirect(url.toString())
}
