import { describe, expect, it, vi } from 'vitest'
import { retryOnExpiredSession } from './session-refetch'

const expired = () => new Response(JSON.stringify({ code: 'session_expired' }), { status: 401, headers: { 'content-type': 'application/json' } })
const ok = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })

function host(responses: Array<() => Response>) {
  const calls: unknown[] = []
  const h = { location: { origin: 'https://app.test' }, fetch: (async (input: RequestInfo | URL) => { calls.push(input); return (responses.shift() ?? ok)() }) as typeof fetch }
  return { h, calls }
}

describe('retryOnExpiredSession', () => {
  it('refreshes the session once and sends the API call again', async () => {
    const { h, calls } = host([expired, ok])
    const refresh = vi.fn(async () => 'token')
    retryOnExpiredSession(h, refresh)
    const res = await h.fetch('/api/touches/queue?count=1')
    expect(res.status).toBe(200)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })

  it('a real sign-out still ends in the 401, after a single retry', async () => {
    const { h, calls } = host([expired, expired])
    retryOnExpiredSession(h, async () => null)
    expect((await h.fetch('/api/analyst')).status).toBe(401)
    expect(calls).toHaveLength(2)
  })

  it('leaves other origins, other paths and other 401s alone', async () => {
    const { h, calls } = host([expired, expired, () => new Response('{"error":"x"}', { status: 401, headers: { 'content-type': 'application/json' } })])
    const refresh = vi.fn(async () => 'token')
    retryOnExpiredSession(h, refresh)
    await h.fetch('https://other.test/api/x')
    await h.fetch('/dashboard')
    await h.fetch('/api/x')
    expect(refresh).not.toHaveBeenCalled()
    expect(calls).toHaveLength(3)
  })

  it('concurrent expired calls share one refresh, and the original fetch comes back on cleanup', async () => {
    const { h } = host([expired, expired, ok, ok])
    const original = h.fetch
    const refresh = vi.fn(async () => 'token')
    const restore = retryOnExpiredSession(h, refresh)
    await Promise.all([h.fetch('/api/a'), h.fetch('/api/b')])
    expect(refresh).toHaveBeenCalledTimes(1)
    restore()
    expect(h.fetch).toBe(original)
  })
})
