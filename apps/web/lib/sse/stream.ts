/**
 * lib/sse/stream.ts
 *
 * Bounded Server-Sent Events (SSE) helper for Vercel Hobby.
 *
 * Design constraints:
 *  - Vercel Hobby functions time out after ~10s on Edge or ~60s on Node runtime.
 *  - We use a 20s max-duration: safe on both runtimes, well below Hobby ceiling.
 *  - The native EventSource client reconnects automatically on close
 *    no client-side reconnect logic needed for normal flow.
 *
 * Usage:
 *   return createSSEStream(async (send, signal) => {
 *     while (!signal.aborted) {
 *       const data = await pollSomething()
 *       if (data.length > 0) send('my-event', data)
 *       await sleep(3_000, signal)   // interruptible sleep
 *     }
 *   })
 *
 * The `signal` is aborted automatically when:
 *  - `maxMs` has elapsed (client should reconnect)
 *  - The client disconnects
 *  - The handler resolves/rejects
 */

export type SendFn = (event: string, data: unknown) => void

export function createSSEStream(
  handler: (send: SendFn, signal: AbortSignal) => Promise<void>,
  maxMs = 20_000,
): Response {
  const encoder = new TextEncoder()
  const abort   = new AbortController()

  const stream = new ReadableStream({
    start(controller) {
      // ── Helpers ──────────────────────────────────────────────────────────

      const enqueue = (chunk: string) => {
        if (abort.signal.aborted) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Stream was already closed — ignore
        }
      }

      const send: SendFn = (event, data) =>
        enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      // ── Heartbeat ─────────────────────────────────────────────────────────
      // Keeps the connection alive through proxies and CDNs that close idle connections
      const heartbeat = setInterval(() => enqueue(': ping\n\n'), 15_000)

      // ── Hard timeout ──────────────────────────────────────────────────────
      // Tell the client to reconnect after maxMs: native EventSource reconnects automatically
      const timeout = setTimeout(() => {
        clearInterval(heartbeat)
        abort.abort()
        enqueue('event: close\ndata: {"reason":"timeout"}\n\n')
        try { controller.close() } catch { /* already closed */ }
      }, maxMs)

      // ── Run handler ───────────────────────────────────────────────────────
      handler(send, abort.signal)
        .catch((err) => {
          // Normal abort (timeout / client disconnect) -> ignore.
          // Real errors (DB down, etc.) -> notify the client so it backs off
          // before reconnecting instead of hammering the server in a tight loop.
          if (!abort.signal.aborted) {
            console.error('[SSE] handler error:', err)
            try {
              enqueue('event: error\ndata: {"reason":"internal"}\n\n')
            } catch { /* stream already closed */ }
          }
        })
        .finally(() => {
          clearTimeout(timeout)
          clearInterval(heartbeat)
          if (!abort.signal.aborted) {
            abort.abort()
            try { controller.close() } catch { /* already closed */ }
          }
        })
    },

    // Client disconnected
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',   // disable nginx/Vercel edge buffering
    },
  })
}

/**
 * Interruptible sleep: resolves when either the delay elapses or signal is aborted.
 * Use inside SSE handlers to avoid blocking the abort path.
 */
export function sleepInterruptible(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return }
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
  })
}
