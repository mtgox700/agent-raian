import { describe, it, expect, vi, afterEach } from 'vitest'
import { RedisIdempotencyStore, isRedisConfigured, getIdempotencyStore } from './upstash-store'
import { InMemoryIdempotencyStore } from './idempotency'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function mockFetch(result: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result }) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('isRedisConfigured', () => {
  it('is false without env, true with both vars', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    expect(isRedisConfigured()).toBe(false)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://db.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
    expect(isRedisConfigured()).toBe(true)
  })
})

describe('RedisIdempotencyStore', () => {
  it('claim sends SET NX EX and returns true on OK', async () => {
    const fetchMock = mockFetch('OK')
    const store = new RedisIdempotencyStore('https://db.upstash.io', 'tok')
    expect(await store.claim('k', 5000)).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://db.upstash.io')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual(['SET', 'k', '1', 'NX', 'EX', 5])
  })

  it('claim returns false when key already exists (null result)', async () => {
    mockFetch(null)
    const store = new RedisIdempotencyStore('https://db.upstash.io', 'tok')
    expect(await store.claim('k')).toBe(false)
  })

  it('has maps EXISTS 1 → true, 0 → false', async () => {
    mockFetch(1)
    const store = new RedisIdempotencyStore('https://db.upstash.io', 'tok')
    expect(await store.has('k')).toBe(true)
    mockFetch(0)
    const store2 = new RedisIdempotencyStore('https://db.upstash.io', 'tok')
    expect(await store2.has('k')).toBe(false)
  })

  it('release issues DEL', async () => {
    const fetchMock = mockFetch(1)
    const store = new RedisIdempotencyStore('https://db.upstash.io', 'tok')
    await store.release('k')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(['DEL', 'k'])
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }))
    const store = new RedisIdempotencyStore('https://db.upstash.io', 'tok')
    await expect(store.claim('k')).rejects.toThrow(/500/)
  })
})

describe('getIdempotencyStore', () => {
  it('returns in-memory store when Redis not configured', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    expect(getIdempotencyStore()).toBeInstanceOf(InMemoryIdempotencyStore)
  })
  it('returns Redis store when configured', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://db.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
    expect(getIdempotencyStore()).toBeInstanceOf(RedisIdempotencyStore)
  })
})
