/**
 * Authentication of Unipile webhooks.
 *
 * Unipile does not sign its callbacks, and the route is public: without a
 * shared secret anyone could post a fake "LinkedIn reply" and stop a lead's
 * sequence, or create notifications. The secret travels either as a header
 * (set on the messaging webhook created through the Unipile API) or as a
 * `token` query parameter (appended to the hosted-auth notify_url we build).
 *
 * Rollout: while UNIPILE_WEBHOOK_SECRET is unset, calls are accepted and a
 * warning is logged, so production keeps detecting replies until the secret
 * is configured on both sides.
 */

import { safeCompare } from '@/lib/security/crypto'

export const UNIPILE_SECRET_HEADER = 'x-phantera-webhook-secret'

export type WebhookAuth = 'ok' | 'unconfigured' | 'rejected'

/**
 * Surrounding whitespace is ignored on both sides: a secret pasted into the
 * Vercel or Unipile dashboard with a trailing space or newline made every
 * genuine LinkedIn event fail with 401 (seen in production on 2026-10-08).
 */
export function verifyUnipileWebhook(req: Request, secret = process.env.UNIPILE_WEBHOOK_SECRET): WebhookAuth {
  const expected = secret?.trim()
  if (!expected) return 'unconfigured'
  const { header, query } = presentedSecrets(req)
  return safeCompare(header, expected) || safeCompare(query, expected) ? 'ok' : 'rejected'
}

function presentedSecrets(req: Request): { header: string | null; query: string | null } {
  return {
    header: req.headers.get(UNIPILE_SECRET_HEADER)?.trim() ?? null,
    query: new URL(req.url).searchParams.get('token')?.trim() ?? null,
  }
}

/**
 * What a rejection looked like, without the secrets: enough to tell a missing
 * token from a different value (lengths differ) or a different secret of the
 * same length.
 */
export function describeRejection(req: Request, secret = process.env.UNIPILE_WEBHOOK_SECRET): string {
  const { header, query } = presentedSecrets(req)
  const presented = header ?? query
  const source = header ? 'header' : query ? 'token query' : 'none'
  return `secret from ${source}, length ${presented?.length ?? 0} (expected ${secret?.trim().length ?? 0})`
}

/** The notify URL handed to Unipile, carrying the secret when configured. */
export function unipileWebhookUrl(origin: string, secret = process.env.UNIPILE_WEBHOOK_SECRET): string {
  const url = new URL('/api/webhooks/unipile', origin)
  if (secret) url.searchParams.set('token', secret)
  return url.toString()
}
