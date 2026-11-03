/**
 * POST /api/webhooks/brevo-sms?w=<workspaceId>&t=<token>
 *
 * Brevo calls the webUrl given with each automatic SMS. The token is an HMAC
 * of the workspace id: a caller without it cannot touch any lead.
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applySmsEvent, readSmsEvent } from '@/lib/sms/brevo-events'
import { verifySmsWebhookToken } from '@/lib/sms/settings'
import { getClientKey } from '@/lib/security/rate-limit'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 32 * 1024

export async function POST(req: Request): Promise<NextResponse> {
  const throttle = await limit(getClientKey(req), { windowSec: 60, max: 300, scope: 'webhook:brevo-sms' })
  if (!throttle.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const params = new URL(req.url).searchParams
  const workspaceId = params.get('w') ?? ''
  const token = params.get('t') ?? ''
  if (!workspaceId || !token || !verifySmsWebhookToken(workspaceId, token)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 })
  }
  const payload = await req.json().catch(() => null)
  const events = Array.isArray(payload) ? payload.slice(0, 50) : [payload]

  try {
    for (const raw of events) {
      const event = readSmsEvent(raw)
      if (!event) continue
      const outcome = await applySmsEvent(db, workspaceId, event)
      if (outcome === 'OPTED_OUT' || outcome === 'BOUNCED') {
        console.info(`[webhooks/brevo-sms] ${outcome} workspace=${workspaceId}`)
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhooks/brevo-sms] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
