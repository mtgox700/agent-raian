/**
 * POST /api/webhooks/apollo-phone?token=<one-time token>
 *
 * Apollo delivers the phone numbers of a people/match lookup here, a few
 * minutes after the request. Apollo does not sign webhooks: the token in the
 * URL was generated for that one lookup and only its hash is stored.
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleRevealWebhook } from '@/lib/phone/apollo-reveal'
import { getClientKey } from '@/lib/security/rate-limit'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024

export async function POST(req: Request): Promise<NextResponse> {
  const throttle = await limit(getClientKey(req), { windowSec: 60, max: 120, scope: 'webhook:apollo-phone' })
  if (!throttle.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 })

  const token = new URL(req.url).searchParams.get('token') ?? ''
  const text = await req.text().catch(() => '')
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 })

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const outcome = await handleRevealWebhook(db, token, payload)
    if (outcome === 'UNKNOWN_TOKEN') return NextResponse.json({ error: 'unknown' }, { status: 404 })
    if (outcome === 'INVALID') return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[apollo-phone] webhook failed:', err instanceof Error ? err.message : err)
    // 500 so Apollo retries; the handler is idempotent.
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
