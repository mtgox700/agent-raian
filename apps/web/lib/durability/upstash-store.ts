/**
 * Phantera: Upstash Redis idempotency store.
 *
 * Cross-instance implementation of IdempotencyStore using the Upstash Redis REST
 * API (plain fetch: no SDK dependency, works on edge/serverless). Swaps in for
 * InMemoryIdempotencyStore without touching call sites, giving durable
 * idempotency across all Vercel instances.
 *
 * Config (env):
 *   UPSTASH_REDIS_REST_URL    e.g. https://<db>.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN  bearer token
 */

import type { IdempotencyStore } from './idempotency'
import { InMemoryIdempotencyStore } from './idempotency'

export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly url = process.env.UPSTASH_REDIS_REST_URL ?? '',
    private readonly token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  ) {}

  /** Execute one Redis command via the Upstash REST API. */
  private async cmd(args: Array<string | number>): Promise<unknown> {
    const res = await fetch(this.url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Upstash command failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    const data = (await res.json()) as { result?: unknown; error?: string }
    if (data.error) throw new Error(`Upstash error: ${data.error}`)
    return data.result
  }

  async has(key: string): Promise<boolean> {
    return (await this.cmd(['EXISTS', key])) === 1
  }

  async claim(key: string, ttlMs?: number): Promise<boolean> {
    // SET key 1 NX [EX seconds]: returns "OK" when newly set, null when it
    // already existed. Atomic, so safe across concurrent instances.
    const args: Array<string | number> = ['SET', key, '1', 'NX']
    if (ttlMs && ttlMs > 0) {
      args.push('EX', Math.max(1, Math.ceil(ttlMs / 1000)))
    }
    return (await this.cmd(args)) === 'OK'
  }

  async release(key: string): Promise<void> {
    await this.cmd(['DEL', key])
  }
}

/**
 * Returns the Redis-backed store when Upstash is configured, otherwise the
 * in-memory store (fine for dev / low traffic). Call sites stay unchanged.
 */
export function getIdempotencyStore(): IdempotencyStore {
  return isRedisConfigured() ? new RedisIdempotencyStore() : new InMemoryIdempotencyStore()
}
