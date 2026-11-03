/**
 * Retries a same-origin /api call once after a token refresh when the API
 * answered `401 session_expired` (see components/providers/SessionRefetch).
 * Returns the function that restores the original fetch.
 */

type FetchHost = { fetch: typeof fetch; location: { origin: string } }

function apiUrl(input: RequestInfo | URL, origin: string): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    const url = new URL(raw, origin)
    return url.origin === origin && url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

async function isSessionExpired(res: Response): Promise<boolean> {
  if (res.status !== 401 || !(res.headers.get('content-type') ?? '').includes('application/json')) return false
  const body = await res.clone().json().catch(() => null) as { code?: string } | null
  return body?.code === 'session_expired'
}

export function retryOnExpiredSession(host: FetchHost, refresh: () => Promise<unknown>): () => void {
  const original = host.fetch
  let refreshing: Promise<unknown> | null = null

  const wrapped: typeof fetch = async (input, init) => {
    const res = await original(input, init)
    if (!apiUrl(input, host.location.origin) || !(await isSessionExpired(res))) return res
    // A request whose body was a stream cannot be sent twice.
    if (input instanceof Request && input.bodyUsed) return res
    try {
      // Concurrent 401s share one refresh.
      refreshing ??= refresh().finally(() => { refreshing = null })
      await refreshing
    } catch {
      return res
    }
    return original(input instanceof Request ? input.clone() : input, init)
  }
  host.fetch = wrapped
  return () => { if (host.fetch === wrapped) host.fetch = original }
}
