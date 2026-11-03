/**
 * Tests for the in-memory rate limiter.
 *
 * Strategy:
 *   - Use unique scopes per test → isolated buckets, no shared state pollution.
 *   - Use `vi.useFakeTimers()` to control window expiration deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  rateLimit,
  getClientKey,
  tooManyRequests,
  type RateLimitResult,
} from './rate-limit'

// Helpers ────────────────────────────────────────────────────────────────────

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/test', {
    headers: new Headers(headers),
  })
}

let testIdx = 0
function uniqueScope(): string {
  testIdx++
  return `test:${Date.now()}:${testIdx}:${Math.random().toString(36).slice(2)}`
}

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── Basic counting behaviour ──────────────────────────────────────────

  it('allows the first request and decrements remaining', () => {
    const r = rateLimit('user:alice', { windowSec: 60, max: 3, scope: uniqueScope() })
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
    expect(r.retryAfter).toBe(0)
  })

  it('counts requests within the same window', () => {
    const scope = uniqueScope()
    const opts  = { windowSec: 60, max: 3, scope }

    const r1 = rateLimit('user:bob', opts)
    const r2 = rateLimit('user:bob', opts)
    const r3 = rateLimit('user:bob', opts)

    expect(r1.remaining).toBe(2)
    expect(r2.remaining).toBe(1)
    expect(r3.remaining).toBe(0)
    expect([r1, r2, r3].every((r) => r.allowed)).toBe(true)
  })

  it('blocks once max is reached', () => {
    const scope = uniqueScope()
    const opts  = { windowSec: 60, max: 2, scope }

    rateLimit('user:carol', opts)
    rateLimit('user:carol', opts)
    const blocked = rateLimit('user:carol', opts)

    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  // ─── Window expiration ─────────────────────────────────────────────────

  it('resets after the window expires', () => {
    const scope = uniqueScope()
    const opts  = { windowSec: 30, max: 1, scope }

    const first = rateLimit('user:dave', opts)
    expect(first.allowed).toBe(true)

    const blocked = rateLimit('user:dave', opts)
    expect(blocked.allowed).toBe(false)

    // Fast-forward past the window
    vi.advanceTimersByTime(31_000)

    const fresh = rateLimit('user:dave', opts)
    expect(fresh.allowed).toBe(true)
    expect(fresh.remaining).toBe(0) // max=1 so remaining=0 after fresh start
  })

  it('retryAfter reflects time until reset', () => {
    const scope = uniqueScope()
    const opts  = { windowSec: 60, max: 1, scope }

    rateLimit('user:eve', opts)
    const blocked = rateLimit('user:eve', opts)

    expect(blocked.retryAfter).toBeGreaterThanOrEqual(59)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  // ─── Scope isolation ───────────────────────────────────────────────────

  it('uses independent buckets per scope', () => {
    const opts1 = { windowSec: 60, max: 1, scope: uniqueScope() }
    const opts2 = { windowSec: 60, max: 1, scope: uniqueScope() }

    const r1 = rateLimit('user:frank', opts1)
    const r2 = rateLimit('user:frank', opts2)

    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
  })

  it('uses independent buckets per clientKey', () => {
    const scope = uniqueScope()
    const opts  = { windowSec: 60, max: 1, scope }

    expect(rateLimit('ip:1.1.1.1', opts).allowed).toBe(true)
    expect(rateLimit('ip:1.1.1.1', opts).allowed).toBe(false) // same key blocked
    expect(rateLimit('ip:2.2.2.2', opts).allowed).toBe(true)  // different key allowed
  })

  it('falls back to scope "global" when none provided', () => {
    // We can only assert that no error is thrown and a result is returned;
    // the default scope shares storage across calls inside this test.
    const r1 = rateLimit('user:globaltest:1', { windowSec: 60, max: 5 })
    const r2 = rateLimit('user:globaltest:2', { windowSec: 60, max: 5 })
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
  })
})

// ─── getClientKey ──────────────────────────────────────────────────────────

describe('getClientKey', () => {
  it('prefers userId when provided', () => {
    const req = makeReq({ 'x-forwarded-for': '8.8.8.8' })
    expect(getClientKey(req, 'user_123')).toBe('user:user_123')
  })

  it('uses x-forwarded-for when no userId', () => {
    const req = makeReq({ 'x-forwarded-for': '8.8.8.8' })
    expect(getClientKey(req)).toBe('ip:8.8.8.8')
  })

  it('takes only the first IP from x-forwarded-for (proxy chain)', () => {
    const req = makeReq({ 'x-forwarded-for': '8.8.8.8, 9.9.9.9, 10.10.10.10' })
    expect(getClientKey(req)).toBe('ip:8.8.8.8')
  })

  it('falls back to x-real-ip when x-forwarded-for missing', () => {
    const req = makeReq({ 'x-real-ip': '4.4.4.4' })
    expect(getClientKey(req)).toBe('ip:4.4.4.4')
  })

  it('falls back to cf-connecting-ip when other headers missing', () => {
    const req = makeReq({ 'cf-connecting-ip': '5.5.5.5' })
    expect(getClientKey(req)).toBe('ip:5.5.5.5')
  })

  it('returns "ip:unknown" when all IP headers are missing', () => {
    const req = makeReq({})
    expect(getClientKey(req)).toBe('ip:unknown')
  })

  it('treats null userId as no-userId', () => {
    const req = makeReq({ 'x-forwarded-for': '1.2.3.4' })
    expect(getClientKey(req, null)).toBe('ip:1.2.3.4')
  })
})

// ─── tooManyRequests response builder ──────────────────────────────────────

describe('tooManyRequests', () => {
  it('returns a 429 with the standard headers', async () => {
    const result: RateLimitResult = {
      allowed:    false,
      remaining:  0,
      resetAt:    Math.floor(Date.now() / 1000) + 30,
      retryAfter: 30,
    }
    const res = tooManyRequests(result, 10)

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(res.headers.get('X-RateLimit-Reset')).toMatch(/^\d+$/)
  })

  it('returns a JSON body explaining the error', async () => {
    const result: RateLimitResult = {
      allowed:    false,
      remaining:  0,
      resetAt:    Date.now() + 60_000,
      retryAfter: 60,
    }
    const res  = tooManyRequests(result, 5)
    const body = await res.json() as { error: string }

    expect(body.error).toMatch(/trop de requêtes/i)
  })
})
