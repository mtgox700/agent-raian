/**
 * Tests — AES-256-GCM crypto module
 */

import { currentKeyId, decrypt, encrypt, keyIdOf, reencrypt } from './crypto'

const TEST_KEY = 'a'.repeat(64) // 32 bytes as hex

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY
})

afterEach(() => {
  delete process.env.ENCRYPTION_KEY
})

describe('encrypt / decrypt', () => {
  it('roundtrip: encrypt then decrypt returns original plaintext', () => {
    const plaintext  = 'oauth-access-token-abc123'
    const ciphertext = encrypt(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext for same input (random IV)', () => {
    const plaintext = 'same-secret'
    const c1 = encrypt(plaintext)
    const c2 = encrypt(plaintext)
    expect(c1).not.toBe(c2)
    // Both still decrypt correctly
    expect(decrypt(c1)).toBe(plaintext)
    expect(decrypt(c2)).toBe(plaintext)
  })

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const ciphertext = encrypt('secret')
    // Change one character in the middle. The ciphertext is random (fresh IV),
    // so a fixed replacement could equal the original (1 in 64): flaky in CI.
    const replacement = ciphertext[20] === 'A' ? 'B' : 'A'
    const tampered = ciphertext.slice(0, 20) + replacement + ciphertext.slice(21)
    expect(tampered).not.toBe(ciphertext)
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws when ENCRYPTION_KEY is not set', () => {
    delete process.env.ENCRYPTION_KEY
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY env var is not set')
  })

  it('throws when ENCRYPTION_KEY has wrong length', () => {
    process.env.ENCRYPTION_KEY = 'tooshort'
    expect(() => encrypt('test')).toThrow('64-char hex string')
  })

  it('handles empty string', () => {
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('handles unicode / long tokens', () => {
    const token = 'Bearer ' + 'a'.repeat(2048) + ' — tëst üñícödé'
    expect(decrypt(encrypt(token))).toBe(token)
  })
})

describe('authentication tag', () => {
  it('refuses a value whose tag was truncated, and a value too short to hold one', () => {
    const value = encrypt('refresh-token')
    const raw = Buffer.from(value, 'base64')
    // iv(12) + first 4 bytes of the tag + data: GCM without a fixed tag
    // length would check only those 4 bytes.
    const truncated = Buffer.concat([raw.subarray(0, 16), raw.subarray(28)]).toString('base64')
    expect(() => decrypt(truncated)).toThrow()
    expect(() => decrypt(Buffer.alloc(20).toString('base64'))).toThrow('too short')
  })
})

describe('versioned keys and rotation', () => {
  const OLD = 'b'.repeat(64)
  const NEW = 'c'.repeat(64)
  afterEach(() => { delete process.env.ENCRYPTION_KEYS })

  /** A value as written before versioning: no prefix, under ENCRYPTION_KEY. */
  const legacyCiphertext = (plaintext: string) => encrypt(plaintext)

  it('keeps writing the old format until ENCRYPTION_KEYS is set (deploy and rollback safe)', () => {
    const value = encrypt('x')
    expect(value.startsWith('ek:')).toBe(false)
    expect(keyIdOf(value)).toBe('0')
    expect(reencrypt(value)).toEqual({ value, changed: false })
  })

  it('tags every new value with the key that wrote it once versioning is on', () => {
    process.env.ENCRYPTION_KEYS = `k2:${NEW},k1:${OLD}`
    expect(encrypt('x')).toMatch(/^ek:k2:/)
    expect(currentKeyId()).toBe('k2')
  })

  it('still reads values written before versioning', () => {
    const legacy = legacyCiphertext('legacy-token')
    expect(keyIdOf(legacy)).toBe('0')
    process.env.ENCRYPTION_KEYS = `k1:${NEW}`
    expect(decrypt(legacy)).toBe('legacy-token')
  })

  it('rotates: old values readable during the rotation, re-encrypted under the new key, idempotent', () => {
    process.env.ENCRYPTION_KEYS = `k1:${OLD}`
    const before = encrypt('refresh-token')
    process.env.ENCRYPTION_KEYS = `k2:${NEW},k1:${OLD}`
    expect(decrypt(before)).toBe('refresh-token')
    const moved = reencrypt(before)
    expect(moved.changed).toBe(true)
    expect(keyIdOf(moved.value)).toBe('k2')
    expect(reencrypt(moved.value)).toEqual({ value: moved.value, changed: false })
    process.env.ENCRYPTION_KEYS = `k2:${NEW}`
    expect(decrypt(moved.value)).toBe('refresh-token')
    expect(() => decrypt(before)).toThrow('Encryption key "k1" is not configured')
  })

  it('rejects malformed key lists', () => {
    process.env.ENCRYPTION_KEYS = `K-1:${NEW}`
    expect(() => encrypt('x')).toThrow('short lowercase id')
    process.env.ENCRYPTION_KEYS = 'k1:short'
    expect(() => encrypt('x')).toThrow('64-char hex string')
    process.env.ENCRYPTION_KEYS = `k1:${NEW},k1:${OLD}`
    expect(() => encrypt('x')).toThrow('duplicate key id')
    process.env.ENCRYPTION_KEYS = `0:${NEW}`
    expect(() => encrypt('x')).toThrow('reserved for ENCRYPTION_KEY')
  })
})
