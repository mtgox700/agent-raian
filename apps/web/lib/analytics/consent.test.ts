import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VALIDITY_MS,
  parseConsent,
  readConsent,
  writeConsent,
  hasAnalyticsConsent,
  onConsentChange,
  requestConsentDialog,
  onConsentDialogRequest,
} from './consent'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

beforeEach(() => {
  const target = new EventTarget()
  vi.stubGlobal('window', Object.assign(target, { localStorage: new MemoryStorage() }))
})

describe('parseConsent', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')

  it('returns null when nothing was decided', () => {
    expect(parseConsent(null, now)).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    expect(parseConsent('{oops', now)).toBeNull()
  })

  it('returns null when analytics is not a boolean', () => {
    expect(parseConsent(JSON.stringify({ analytics: 'yes', decidedAt: '2026-10-01T00:00:00Z' }), now)).toBeNull()
  })

  it('returns null when the decision date is invalid', () => {
    expect(parseConsent(JSON.stringify({ analytics: true, decidedAt: 'not-a-date' }), now)).toBeNull()
  })

  it('expires a decision older than the validity window', () => {
    const decidedAt = new Date(now - CONSENT_VALIDITY_MS - 1).toISOString()
    expect(parseConsent(JSON.stringify({ analytics: true, decidedAt }), now)).toBeNull()
  })

  it('keeps a valid decision', () => {
    const state = { analytics: false, decidedAt: '2026-10-01T00:00:00.000Z' }
    expect(parseConsent(JSON.stringify(state), now)).toEqual(state)
  })
})

describe('consent storage', () => {
  it('has no analytics consent by default', () => {
    expect(hasAnalyticsConsent()).toBe(false)
  })

  it('grants analytics only after an explicit acceptance', () => {
    writeConsent(true)
    expect(hasAnalyticsConsent()).toBe(true)
    expect(readConsent()?.analytics).toBe(true)
  })

  it('a refusal never grants analytics', () => {
    writeConsent(false)
    expect(hasAnalyticsConsent()).toBe(false)
    expect(readConsent()?.analytics).toBe(false)
  })

  it('persists under the documented key', () => {
    writeConsent(true)
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    expect(JSON.parse(raw ?? '{}').analytics).toBe(true)
  })

  it('treats an unreadable storage as no consent', () => {
    vi.stubGlobal('window', Object.assign(new EventTarget(), {
      localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } },
    }))
    expect(hasAnalyticsConsent()).toBe(false)
    expect(() => writeConsent(true)).not.toThrow()
  })
})

describe('consent events', () => {
  it('notifies listeners of every decision', () => {
    const listener = vi.fn()
    const off = onConsentChange(listener)
    writeConsent(true)
    writeConsent(false)
    off()
    writeConsent(true)
    expect(listener.mock.calls.map((c) => c[0].analytics)).toEqual([true, false])
  })

  it('lets any component reopen the consent dialog', () => {
    const listener = vi.fn()
    const off = onConsentDialogRequest(listener)
    requestConsentDialog()
    off()
    requestConsentDialog()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
