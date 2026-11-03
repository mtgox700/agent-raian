/**
 * In-memory token-bucket rate limiter for Next.js route handlers.
 *
 * IMPORTANT: Scope:
 *   Vercel serverless instances are short-lived but each instance keeps its
 *   own bucket. This is sufficient to neutralise burst abuse from a single
 *   client. For strict cross-instance limits, migrate to Upstash Redis
 *   (drop-in replacement: only `store` needs to change).
 *
 * Algorithm: simple sliding-window counter with periodic eviction.
 * Memory bound: MAX_KEYS entries; least-recently-touched evicted first.
 */
import { NextResponse } from 'next/server'

interface Bucket {
  count:     number
  resetAt:   number  // unix ms when the window resets
  touchedAt: number  // for LRU eviction
}

const MAX_KEYS = 10_000

const store = new Map<string, Bucket>()

// ─── LRU eviction ─────────────────────────────────────────────────────────────

function evictIfNeeded() {
  if (store.size <= MAX_KEYS) return
  // Drop the oldest 10% of entries by touchedAt
  const toRemove = Math.ceil(store.size * 0.1)
  const sorted   = [...store.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)
  for (let i = 0; i < toRemove; i++) {
    const entry = sorted[i]
    if (entry) store.delete(entry[0])
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Window length in seconds */
  windowSec: number
  /** Maximum requests allowed inside the window */
  max:       number
  /** Logical identifier: defaults to the route path */
  scope?:    string
}

export interface RateLimitResult {
  allowed:   boolean
  remaining: number
  resetAt:   number
  retryAfter: number   // seconds until reset, 0 if allowed
}

/**
 * Check whether `clientKey` (typically IP or userId) is within the limits
 * defined by `opts`. Returns the bucket state. Does NOT throw.
 */
export function rateLimit(clientKey: string, opts: RateLimitOptions): RateLimitResult {
  const now    = Date.now()
  const scope  = opts.scope ?? 'global'
  const key    = `${scope}::${clientKey}`
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= now) {
    // Fresh window
    const resetAt = now + opts.windowSec * 1000
    store.set(key, { count: 1, resetAt, touchedAt: now })
    evictIfNeeded()
    return {
      allowed:    true,
      remaining:  opts.max - 1,
      resetAt,
      retryAfter: 0,
    }
  }

  bucket.touchedAt = now

  if (bucket.count >= opts.max) {
    return {
      allowed:    false,
      remaining:  0,
      resetAt:    bucket.resetAt,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count++
  return {
    allowed:    true,
    remaining:  opts.max - bucket.count,
    resetAt:    bucket.resetAt,
    retryAfter: 0,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a stable client identifier from a NextRequest-like object.
 * Prefers Cloudflare / Vercel headers, falls back to `unknown`.
 */
export function getClientKey(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`
  // The headers the edge sets first: the leftmost x-forwarded-for entry is
  // whatever the client sent, and rotating it would give a fresh bucket.
  const ip =
    req.headers.get('x-real-ip') ??
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  return `ip:${ip}`
}

/**
 * Build a 429 Response with the standard headers.
 */
export function tooManyRequests(result: RateLimitResult, max: number): Response {
  return NextResponse.json(
    { error: 'Trop de requêtes, réessayez plus tard.' },
    {
      status: 429,
      headers: {
        'Retry-After':            String(result.retryAfter),
        'X-RateLimit-Limit':      String(max),
        'X-RateLimit-Remaining':  String(result.remaining),
        'X-RateLimit-Reset':      String(Math.ceil(result.resetAt / 1000)),
      },
    },
  )
}
