/**
 * Rate limits shared by every server instance, kept in Postgres.
 *
 * The in-memory limiter (rate-limit.ts) counts per Vercel instance: an
 * attacker spread over instances, or a burst after a cold start, never hits
 * the limit. Here every instance increments the same counter.
 *
 * Algorithm: sliding window counter. Each window has a row keyed
 * `scope::client::windowIndex`; the estimate is
 *   previous × (share of the previous window still inside the sliding window) + current
 * One atomic statement per check (insert-or-increment, then read the previous
 * window). Attempts beyond the limit are counted too: hammering keeps the
 * door shut.
 *
 * If the database cannot answer within 300 ms, the in-memory limiter
 * decides: a database hiccup degrades the protection to per-instance, it
 * never opens it, blocks every user, nor holds requests while the pool waits.
 */

import { isIP } from 'node:net'
import { rateLimit as memoryLimit, type RateLimitOptions, type RateLimitResult } from './rate-limit'

interface RawDb {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>
}

const DB_TIMEOUT_MS = 300

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function defaultDb(): Promise<RawDb> {
  return (await import('@/lib/db')).db as unknown as RawDb
}

export interface SharedLimitOptions extends RateLimitOptions {
  /** For tests and scripts: the database to use, and "now". */
  db?: RawDb
  now?: number
}

export async function limit(clientKey: string, opts: SharedLimitOptions): Promise<RateLimitResult> {
  const now = opts.now ?? Date.now()
  const windowMs = opts.windowSec * 1000
  const index = Math.floor(now / windowMs)
  const base = `${opts.scope ?? 'global'}::${clientKey}`
  const currentKey = `${base}::${index}`
  const previousKey = `${base}::${index - 1}`
  // Kept two windows: the previous one still weighs on the next window.
  const expiresAt = new Date((index + 2) * windowMs)

  try {
    const db = opts.db ?? await defaultDb()
    const rows = await within(db.$queryRaw<Array<{ current: number; previous: number }>>`
      WITH cur AS (
        INSERT INTO "RateLimitWindow" ("key", "count", "expiresAt")
        VALUES (${currentKey}, 1, ${expiresAt})
        ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimitWindow"."count" + 1
        RETURNING "count"
      )
      SELECT (SELECT "count" FROM cur)::int AS current,
             COALESCE((SELECT "count" FROM "RateLimitWindow" WHERE "key" = ${previousKey}), 0)::int AS previous`, DB_TIMEOUT_MS)
    const { current, previous } = rows[0] ?? { current: 1, previous: 0 }
    const elapsed = (now - index * windowMs) / windowMs
    const estimate = previous * (1 - elapsed) + current
    const resetAt = (index + 1) * windowMs
    if (estimate > opts.max) {
      return { allowed: false, remaining: 0, resetAt, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) }
    }
    return { allowed: true, remaining: Math.max(0, Math.floor(opts.max - estimate)), resetAt, retryAfter: 0 }
  } catch (err) {
    console.warn('[rate-limit] shared store unavailable, per-instance limit used:', err instanceof Error ? err.message : String(err))
    return memoryLimit(clientKey, opts)
  }
}

/**
 * Several limits at once (per user AND per workspace AND per IP): refused as
 * soon as one is reached. All are counted, so a refused attempt still weighs
 * on every key.
 */
export async function limitAll(checks: Array<{ key: string | null | undefined; opts: SharedLimitOptions }>): Promise<RateLimitResult> {
  const results = await Promise.all(checks.filter((c) => c.key).map((c) => limit(c.key as string, c.opts)))
  return results.find((r) => !r.allowed) ?? results.reduce<RateLimitResult>(
    (min, r) => (r.remaining < min.remaining ? r : min),
    { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetAt: 0, retryAfter: 0 },
  )
}

/** Deletes the windows that no longer count. Run by a daily cron. */
export async function purgeRateLimits(db?: RawDb): Promise<number> {
  const client = db ?? await defaultDb()
  return client.$executeRaw`DELETE FROM "RateLimitWindow" WHERE "expiresAt" < NOW()`
}

/**
 * The caller's IP as seen by Vercel (x-real-ip / x-vercel-forwarded-for are
 * set by the platform; the first x-forwarded-for entry as a fallback).
 */
export function clientIp(req: Request): string {
  return req.headers.get('x-real-ip')
    ?? req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
}

/**
 * The rate-limit key of the caller's network: the IPv4 address, or the /64 of
 * an IPv6 one (a single host owns a whole /64 and could rotate within it).
 * Null when the IP is unknown: a shared "unknown" bucket would let one
 * client lock everyone out, so the per-IP limit is skipped instead.
 */
export function ipKey(req: Request): string | null {
  const ip = clientIp(req)
  if (isIP(ip) === 4) return `ip:${ip}`
  if (isIP(ip) === 6) {
    const [head, tail = ''] = ip.toLowerCase().split('::')
    const left = head ? head.split(':') : []
    const right = tail ? tail.split(':') : []
    const full = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    return `ip6:${full.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, '')).join(':')}::/64`
  }
  return null
}
