/**
 * GET /api/auth/outlook?workspaceId=…
 *
 * Initiates the Microsoft OAuth 2.0 consent flow.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { signOAuthState } from '@/lib/security/oauth-state'
import { requireAccess } from '@/lib/auth/access'
import { checkStepUp } from '@/lib/auth/step-up'
import { db } from '@/lib/db'

const SCOPES = [
  'Mail.Send',
  'Mail.Read',
  'User.Read',
  'offline_access',
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

  const clientId  = process.env.MICROSOFT_CLIENT_ID
  const tenantId  = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
    ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/outlook/callback`

  if (!clientId) return NextResponse.json({ error: 'Microsoft OAuth non configuré' }, { status: 500 })

  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: 'Phantera n\'est pas correctement configuré (ENCRYPTION_KEY manquante). Contactez le support.' },
      { status: 500 },
    )
  }

  // Signed + time-limited state (10 min): prevents replay attacks.
  const state = signOAuthState(workspaceId, userId)

  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id',     clientId)
  url.searchParams.set('redirect_uri',  redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope',         SCOPES)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('prompt',        'consent')
  url.searchParams.set('state',         state)

  return NextResponse.redirect(url.toString())
}
