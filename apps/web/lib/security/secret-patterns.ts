/**
 * Shapes of secrets that must never reach a log line: provider keys, OAuth
 * and session tokens, private keys, and our own ciphertexts (a leaked one is
 * harmless alone, but signals that a secret field is being logged).
 *
 * Used by the test suite guard (vitest.setup.ts): any of these printed through
 * the console during the tests fails the run.
 */

export const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Anthropic API key',      pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'Stripe secret key',      pattern: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe webhook secret',  pattern: /\bwhsec_[A-Za-z0-9]{20,}/ },
  { name: 'Google OAuth token',     pattern: /\bya29\.[A-Za-z0-9_-]{20,}/ },
  { name: 'Google refresh token',   pattern: /\b1\/\/[A-Za-z0-9_-]{30,}/ },
  { name: 'Brevo API key',          pattern: /\bxkeysib-[a-f0-9]{20,}/ },
  { name: 'Resend API key',         pattern: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { name: 'AWS access key',         pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key',            pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'JWT',                    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Bearer token',           pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{30,}/ },
  { name: 'Phantera ciphertext',    pattern: /\bek:[a-z0-9]{1,8}:[A-Za-z0-9+/]{40,}={0,2}/ },
]

/** The names of the secret shapes found in a text (empty when clean). */
export function findSecrets(text: string): string[] {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name)
}
