import { describe, expect, it } from 'vitest'
import { findSecrets } from './secret-patterns'

// Fake values built at runtime: no secret-shaped literal sits in the source,
// so secret scanners have nothing to flag here.
const fake = (prefix: string, n: number, alphabet = 'abcdef0123456789') =>
  prefix + Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join('')

describe('secret shapes', () => {
  it('recognises provider keys, tokens and our ciphertexts', () => {
    expect(findSecrets(`key=${fake('sk-ant-', 30)}`)).toEqual(['Anthropic API key'])
    expect(findSecrets(fake('sk_' + 'live_', 24))).toEqual(['Stripe secret key'])
    expect(findSecrets(`token ${fake('ya29.', 40)}`)).toEqual(['Google OAuth token'])
    expect(findSecrets(fake('xkeysib-', 40))).toEqual(['Brevo API key'])
    expect(findSecrets(`Authorization: Bearer ${fake('', 40)}`)).toEqual(['Bearer token'])
    expect(findSecrets(`stored ${fake('ek:k1:', 60, 'ABCDEFabcdef0123456789+/')}`)).toEqual(['Phantera ciphertext'])
    expect(findSecrets(['eyJ' + fake('', 20), 'eyJ' + fake('', 20), fake('', 20)].join('.'))).toEqual(['JWT'])
    expect(findSecrets(['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '))).toEqual(['Private key'])
  })

  it('leaves ordinary log lines alone', () => {
    expect(findSecrets('[send-step] mailbox mb_123 paused until 2026-10-15T10:00:00Z')).toEqual([])
    expect(findSecrets('Bearer token missing')).toEqual([])
    expect(findSecrets('ek:k1:short')).toEqual([])
    expect(findSecrets('user ayoub.hammoudi05+t1@gmail.com joined')).toEqual([])
  })

  it('the test suite guard is active: a console line carrying a secret is recorded', () => {
    // The marker keeps this deliberate line out of the leak report.
    const line = `SECRET_GUARD_SELF_TEST ${fake('sk-ant-', 30)}`
    expect(findSecrets(line)).toEqual(['Anthropic API key'])
    console.log(line)
  })
})
