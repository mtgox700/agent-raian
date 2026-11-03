/**
 * Phantera: AES-256-GCM encryption of secrets at rest (OAuth tokens, SMTP
 * passwords, customers' API keys), with versioned keys so a key can be
 * rotated without downtime.
 *
 * Keys
 *   ENCRYPTION_KEYS  "id:hex64,id:hex64": the first one encrypts, all of
 *                    them decrypt. Ids: 1 to 8 lowercase letters or digits.
 *   ENCRYPTION_KEY   hex64: the original key. Decrypts values written
 *                    before versioning (no prefix), is key "0" when
 *                    ENCRYPTION_KEYS is unset, and remains the root of the
 *                    HMAC signatures (cookies, OAuth state, webhook tokens),
 *                    which a rotation of ENCRYPTION_KEYS does not touch.
 *
 * Ciphertext
 *   "ek:<id>:" + base64( iv[12] || authTag[16] || encrypted )
 *   A value without prefix is the pre-versioning format, under ENCRYPTION_KEY.
 *   Until ENCRYPTION_KEYS is set, new values are still written without prefix:
 *   code from before versioning can read them, so a deploy that overlaps old
 *   instances, or a rollback, never meets a value it cannot decrypt. Setting
 *   ENCRYPTION_KEYS is the deliberate step that starts the new format.
 *
 * Rotation (runbook: .war-room/security/KEY_ROTATION.md)
 *   1. ENCRYPTION_KEYS="new:<hex>,old:<hex>"  -> new values use "new"
 *   2. scripts/rotate-encryption.ts           -> re-encrypts every value
 *   3. drop "old" from ENCRYPTION_KEYS
 *
 * WHY AES-256-GCM: authenticated (tampering is detected), random 96-bit IV
 * per value (same plaintext -> different ciphertext).
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto'

const ALGORITHM  = 'aes-256-gcm'
const IV_BYTES   = 12  // 96-bit IV recommended for GCM
const TAG_BYTES  = 16  // 128-bit auth tag
const PREFIX     = 'ek:'
const KEY_ID     = /^[a-z0-9]{1,8}$/
const LEGACY_ID  = '0'

interface Keyring { current: string; keys: Map<string, Buffer> }

function parseHexKey(hex: string, name: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${name} must be a 64-char hex string (32 bytes)`)
  return Buffer.from(hex, 'hex')
}

/** Read on every call: env changes (tests, rotation) apply without restart logic. */
function keyring(): Keyring {
  const keys = new Map<string, Buffer>()
  const legacy = process.env.ENCRYPTION_KEY
  if (legacy) keys.set(LEGACY_ID, parseHexKey(legacy, 'ENCRYPTION_KEY'))

  const list = process.env.ENCRYPTION_KEYS?.trim()
  if (!list) {
    if (!legacy) throw new Error('ENCRYPTION_KEY env var is not set')
    return { current: LEGACY_ID, keys }
  }
  let current: string | null = null
  for (const entry of list.split(',').map((e) => e.trim()).filter(Boolean)) {
    const parts = entry.split(':')
    const [id, hex] = parts
    if (parts.length !== 2 || !id || !hex || !KEY_ID.test(id)) throw new Error('ENCRYPTION_KEYS entries must be "id:hex64" with a short lowercase id')
    if (id === LEGACY_ID) throw new Error('ENCRYPTION_KEYS: id "0" is reserved for ENCRYPTION_KEY')
    if (keys.has(id)) throw new Error(`ENCRYPTION_KEYS: duplicate key id "${id}"`)
    keys.set(id, parseHexKey(hex, `ENCRYPTION_KEYS[${id}]`))
    current ??= id
  }
  if (!current) throw new Error('ENCRYPTION_KEYS is empty')
  return { current, keys }
}

/** The id new values are encrypted with. */
export function currentKeyId(): string {
  return keyring().current
}

/** The key id a stored value was encrypted with ("0" for the pre-versioning format). */
export function keyIdOf(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) return LEGACY_ID
  return ciphertext.slice(PREFIX.length, ciphertext.indexOf(':', PREFIX.length))
}

/** Encrypt plaintext under the current key: "ek:<id>:" + base64(iv + tag + data), or the legacy format while ENCRYPTION_KEYS is unset. */
export function encrypt(plaintext: string): string {
  const { current, keys } = keyring()
  const key    = keys.get(current) as Buffer
  const iv     = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const body = Buffer.concat([iv, tag, encrypted]).toString('base64')
  return current === LEGACY_ID ? body : `${PREFIX}${current}:${body}`
}

/**
 * Decrypt a stored value, whatever key version wrote it. Throws when the key
 * is no longer configured or the value was tampered with (authTag mismatch).
 */
export function decrypt(ciphertext: string): string {
  const { keys } = keyring()
  const id = keyIdOf(ciphertext)
  const key = keys.get(id)
  if (!key) throw new Error(`Encryption key "${id}" is not configured`)
  const body = ciphertext.startsWith(PREFIX) ? ciphertext.slice(PREFIX.length + id.length + 1) : ciphertext
  const data = Buffer.from(body, 'base64')
  if (data.length < IV_BYTES + TAG_BYTES) throw new Error('Ciphertext too short')

  const iv        = data.subarray(0, IV_BYTES)
  const tag       = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const encrypted = data.subarray(IV_BYTES + TAG_BYTES)

  // The tag length is fixed: without it, GCM would accept a truncated tag,
  // which makes forging a value far easier.
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/** The value under the current key: unchanged when already there, else decrypted and re-encrypted. */
export function reencrypt(ciphertext: string): { value: string; changed: boolean } {
  if (keyIdOf(ciphertext) === currentKeyId()) return { value: ciphertext, changed: false }
  return { value: encrypt(decrypt(ciphertext)), changed: true }
}

/**
 * Constant-time comparison of two secrets (shared bearer tokens / webhook secrets).
 *
 * Plain `a !== b` short-circuits on the first differing byte, leaking length and
 * prefix information through timing. Use this for any server-side comparison of a
 * caller-supplied secret against an expected value.
 *
 * Returns false (never throws) when either value is missing or lengths differ
 * the length check is itself unavoidable, but it leaks only the length, not the
 * contents, and both branches still avoid early byte-by-byte exit.
 */
export function safeCompare(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
