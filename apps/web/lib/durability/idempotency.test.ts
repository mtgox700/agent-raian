import { describe, it, expect, vi } from 'vitest'
import {
  idempotencyKey,
  sendIdempotencyKey,
  InMemoryIdempotencyStore,
  runOnce,
} from './idempotency'

describe('key builders', () => {
  it('normalizes and joins parts', () => {
    expect(idempotencyKey('Send', ' WS_1 ', 'C2')).toBe('send:ws_1:c2')
  })
  it('builds a canonical send key', () => {
    expect(sendIdempotencyKey({ workspaceId: 'ws', campaignId: 'c', leadId: 'l', stepId: 's' }))
      .toBe('send:ws:c:l:s')
  })
})

describe('InMemoryIdempotencyStore', () => {
  it('claims a key once', async () => {
    const s = new InMemoryIdempotencyStore()
    expect(await s.claim('k')).toBe(true)
    expect(await s.claim('k')).toBe(false)
    expect(await s.has('k')).toBe(true)
  })

  it('expires claims after ttl (injected clock)', async () => {
    let t = 1000
    const s = new InMemoryIdempotencyStore(() => t)
    expect(await s.claim('k', 500)).toBe(true)
    expect(await s.has('k')).toBe(true)
    t = 1600 // past expiry
    expect(await s.has('k')).toBe(false)
    expect(await s.claim('k', 500)).toBe(true) // can re-claim after expiry
  })

  it('release allows re-claim', async () => {
    const s = new InMemoryIdempotencyStore()
    await s.claim('k')
    await s.release('k')
    expect(await s.claim('k')).toBe(true)
  })
})

describe('runOnce', () => {
  it('runs fn the first time', async () => {
    const s = new InMemoryIdempotencyStore()
    const fn = vi.fn().mockResolvedValue('done')
    const res = await runOnce(s, 'k', fn)
    expect(res).toEqual({ skipped: false, result: 'done' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('skips fn the second time', async () => {
    const s = new InMemoryIdempotencyStore()
    const fn = vi.fn().mockResolvedValue('done')
    await runOnce(s, 'k', fn)
    const res = await runOnce(s, 'k', fn)
    expect(res).toEqual({ skipped: true })
    expect(fn).toHaveBeenCalledTimes(1) // not called again
  })

  it('releases the claim when fn throws, allowing a later retry', async () => {
    const s = new InMemoryIdempotencyStore()
    const failing = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok')
    await expect(runOnce(s, 'k', failing)).rejects.toThrow('boom')
    // key was released → retry runs fn again and succeeds
    const res = await runOnce(s, 'k', failing)
    expect(res).toEqual({ skipped: false, result: 'ok' })
    expect(failing).toHaveBeenCalledTimes(2)
  })
})
