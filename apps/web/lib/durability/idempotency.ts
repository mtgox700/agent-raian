/**
 * Phantera: Idempotency primitives (Phase 1 foundation)
 *
 * Durable execution (Inngest) replays steps on retry, so every side-effecting
 * action: especially sending an email: must be guarded by an idempotency key
 * so a retry never double-sends. This is the contract the durable workflow
 * relies on.
 *
 * The store is an interface: an in-memory implementation ships now; an Upstash
 * Redis implementation (`SET key NX EX ttl`) slots in for cross-instance
 * guarantees without changing call sites. Pure + injectable clock -> testable.
 */

// ─── Key builders ────────────────────────────────────────────────────────────

/** Join key parts into a single namespaced idempotency key. */
export function idempotencyKey(...parts: Array<string | number>): string {
  return parts.map((p) => String(p).trim().toLowerCase()).join(':')
}

/** Canonical key for "this lead got this campaign step": the send guard. */
export function sendIdempotencyKey(input: {
  workspaceId: string
  campaignId: string
  leadId: string
  stepId: string
}): string {
  return idempotencyKey('send', input.workspaceId, input.campaignId, input.leadId, input.stepId)
}

// ─── Store interface ─────────────────────────────────────────────────────────

export interface IdempotencyStore {
  /** True if the key has already been claimed (and not expired). */
  has(key: string): Promise<boolean>
  /**
   * Atomically claim a key. Returns true if newly claimed, false if it already
   * existed (caller should then skip the side effect).
   */
  claim(key: string, ttlMs?: number): Promise<boolean>
  /** Release a previously claimed key (e.g. after a failed run, to allow retry). */
  release(key: string): Promise<void>
}

// ─── In-memory implementation (per-instance; swap for Redis at scale) ─────────

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, number | null>() // key -> expiry epoch ms (null = no expiry)

  constructor(private readonly now: () => number = Date.now) {}

  private isLive(key: string): boolean {
    if (!this.entries.has(key)) return false
    const expiry = this.entries.get(key)!
    if (expiry === null) return true
    if (expiry <= this.now()) {
      this.entries.delete(key)
      return false
    }
    return true
  }

  async has(key: string): Promise<boolean> {
    return this.isLive(key)
  }

  async claim(key: string, ttlMs?: number): Promise<boolean> {
    if (this.isLive(key)) return false
    this.entries.set(key, ttlMs && ttlMs > 0 ? this.now() + ttlMs : null)
    return true
  }

  async release(key: string): Promise<void> {
    this.entries.delete(key)
  }
}

// ─── runOnce guard ───────────────────────────────────────────────────────────

export interface RunOnceResult<T> {
  skipped: boolean
  result?: T
}

/**
 * Runs `fn` only if `key` has not been claimed before. If already claimed,
 * returns `{ skipped: true }` without running `fn`. On failure the claim is
 * released so a later retry can run (the side effect didn't complete).
 */
export async function runOnce<T>(
  store: IdempotencyStore,
  key: string,
  fn: () => Promise<T>,
  ttlMs?: number,
): Promise<RunOnceResult<T>> {
  const claimed = await store.claim(key, ttlMs)
  if (!claimed) return { skipped: true }
  try {
    const result = await fn()
    return { skipped: false, result }
  } catch (err) {
    // Release so a retry isn't permanently blocked by a failed run (the side
    // effect didn't complete, so the key should not stay claimed).
    await store.release(key)
    throw err
  }
}
