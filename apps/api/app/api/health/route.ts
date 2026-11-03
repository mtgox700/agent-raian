/**
 * GET /api/health: liveness probe (uptime monitoring, CI wait-on).
 * Public, no DB dependency: returns 200 as long as the server is up.
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(): NextResponse {
  return NextResponse.json({ ok: true, service: 'phantera', ts: new Date().toISOString() })
}
