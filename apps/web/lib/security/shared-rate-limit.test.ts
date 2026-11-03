import { describe, expect, it, vi } from 'vitest'
import { clientIp, ipKey, limit, limitAll } from './shared-rate-limit'

/** A stand-in for the RateLimitWindow table, shared like Postgres would be. */
function sharedStore() {
  const rows = new Map<string, number>()
  const db = {
    // Values arrive in the order of the SQL template: current key, expiry, previous key.
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, currentKey: string, _expiresAt: Date, previousKey: string) => {
      rows.set(currentKey, (rows.get(currentKey) ?? 0) + 1)
      return [{ current: rows.get(currentKey), previous: rows.get(previousKey) ?? 0 }]
    }),
    $executeRaw: vi.fn(async () => 0),
  }
  return { db, rows }
}

const T0 = 1_700_000_000_000 - (1_700_000_000_000 % 60_000) // start of a minute
const opts = (db: ReturnType<typeof sharedStore>['db'], now: number) => ({ windowSec: 60, max: 5, scope: 'test', db, now })

describe('shared rate limit', () => {
  it('two server instances share the same counter', async () => {
    const { db } = sharedStore()
    // "Instance A" and "instance B": two callers, one store.
    const instanceA = (now: number) => limit('user:1', opts(db, now))
    const instanceB = (now: number) => limit('user:1', opts(db, now))
    const results = []
    for (let i = 0; i < 6; i++) results.push(await (i % 2 ? instanceB : instanceA)(T0 + i * 1000))
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true)
    expect(results[5]).toMatchObject({ allowed: false, remaining: 0 })
    expect(results[5].retryAfter).toBeGreaterThan(0)
  })

  it('slides: the previous window still weighs at the start of the next one', async () => {
    const { db } = sharedStore()
    for (let i = 0; i < 5; i++) await limit('ip:1', opts(db, T0 + 50_000))
    // 1 s into the next minute, ~98% of the previous 5 still count.
    expect((await limit('ip:1', opts(db, T0 + 61_000))).allowed).toBe(false)
    // At the end of the next minute they barely weigh any more.
    expect((await limit('ip:2', opts(db, T0 + 50_000))).allowed).toBe(true)
    const late = await limit('ip:1', opts(db, T0 + 119_000))
    expect(late.allowed).toBe(true)
  })

  it('counts each key on its own', async () => {
    const { db } = sharedStore()
    for (let i = 0; i < 5; i++) await limit('user:a', opts(db, T0))
    expect((await limit('user:a', opts(db, T0))).allowed).toBe(false)
    expect((await limit('user:b', opts(db, T0))).allowed).toBe(true)
  })

  it('several limits at once: refused when any of them is reached', async () => {
    const { db } = sharedStore()
    const check = (user: string) => limitAll([
      { key: `user:${user}`, opts: { ...opts(db, T0), max: 100 } },
      { key: 'ws:shared', opts: { ...opts(db, T0), max: 3 } },
      { key: null, opts: opts(db, T0) },
    ])
    expect((await check('a')).allowed).toBe(true)
    expect((await check('b')).allowed).toBe(true)
    expect((await check('c')).allowed).toBe(true)
    expect((await check('d')).allowed).toBe(false)
  })

  it('falls back to the per-instance limit when the database does not answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const down = { $queryRaw: vi.fn(async () => { throw new Error('connection refused') }), $executeRaw: vi.fn() }
    const first = await limit('user:down', { windowSec: 60, max: 1, scope: 'fallback-test', db: down })
    const second = await limit('user:down', { windowSec: 60, max: 1, scope: 'fallback-test', db: down })
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reads the client IP set by the platform first', () => {
    const req = (h: Record<string, string>) => new Request('https://x.test', { headers: h })
    expect(clientIp(req({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
    expect(clientIp(req({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8')
    expect(clientIp(req({}))).toBe('unknown')
  })

  it('keys an IPv6 client by its /64 and skips the per-IP limit when the IP is unknown', () => {
    const req = (ip?: string) => new Request('https://x.test', { headers: ip ? { 'x-real-ip': ip } : {} })
    expect(ipKey(req('203.0.113.7'))).toBe('ip:203.0.113.7')
    expect(ipKey(req('2a00:1450:4007:80e::201a'))).toBe('ip6:2a00:1450:4007:80e::/64')
    expect(ipKey(req('2a00:1450:4007:80e:ffff::1'))).toBe('ip6:2a00:1450:4007:80e::/64')
    expect(ipKey(req())).toBeNull()
    expect(ipKey(req('garbage'))).toBeNull()
  })
})
