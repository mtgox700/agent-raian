/**
 * OAuth State Token: signed + time-limited
 *
 * Replaces the previous plain base64-encoded state (vulnerable to replay).
 * Format: base64url(payload).hmac-sha256(payload)
 *
 * - payload contains workspaceId, userId, and `iat` (issued-at timestamp)
 * - max age 10 minutes: replays after that are rejected
 * - HMAC prevents tampering with workspaceId/userId
 */

import { createHmac, timingSafeEqual } from 'crypto'

const MAX_AGE_MS = 10 * 60 * 1000  // 10 minutes

interface OAuthStatePayload {
  workspaceId: string
  userId:      string
  iat:         number  // unix ms
}

function getSecret(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY not set: required for OAuth state signing')
  // Reuse encryption key derivation, distinct purpose via prefix
  return Buffer.from(`oauth-state:${key}`, 'utf8')
}

export function signOAuthState(workspaceId: string, userId: string): string {
  const payload: OAuthStatePayload = { workspaceId, userId, iat: Date.now() }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig        = createHmac('sha256', getSecret()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

export interface VerifyResult {
  ok:           boolean
  payload?:     OAuthStatePayload
  reason?:      'malformed' | 'invalid_signature' | 'expired'
}

export function verifyOAuthState(state: string): VerifyResult {
  const parts = state.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }

  const [payloadB64, sig] = parts
  if (!payloadB64 || !sig) return { ok: false, reason: 'malformed' }

  const expectedSig = createHmac('sha256', getSecret()).update(payloadB64).digest('base64url')

  // Timing-safe comparison to prevent timing attacks
  const sigBuf      = Buffer.from(sig,         'base64url')
  const expectedBuf = Buffer.from(expectedSig, 'base64url')
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  let payload: OAuthStatePayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as OAuthStatePayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof payload.iat !== 'number' || Date.now() - payload.iat > MAX_AGE_MS) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true, payload }
}
