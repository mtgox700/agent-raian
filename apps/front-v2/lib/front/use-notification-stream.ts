'use client'

/**
 * Instant push of new notifications (GET notifications.stream, Server-Sent
 * Events), as in body n°1 (hooks/use-sse-notifications): the server closes
 * after 20 s and the hook reconnects with an advanced cursor; a hidden tab
 * holds no stream; after 3 errors in a row it gives up and the caller's own
 * polling takes over.
 */
import { useEffect, useRef } from 'react'
import { api } from '@/lib/front/api'

const MAX_ERRORS = 3
const BASE_BACKOFF_MS = 1_000

export function useNotificationStream(onNew: () => void) {
  const onNewRef = useRef(onNew)
  useEffect(() => { onNewRef.current = onNew }, [onNew])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    let alive = true
    let errors = 0
    let es: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    // Starting at now: the bell loads the history itself.
    let cursor = new Date().toISOString()

    const stop = () => {
      if (timer) { clearTimeout(timer); timer = null }
      es?.close()
      es = null
    }

    const connect = () => {
      if (!alive || errors >= MAX_ERRORS) return
      stop()
      const source = new EventSource(api.url('notifications.stream', { query: { since: cursor } }))
      es = source
      source.onopen = () => { errors = 0 }
      source.addEventListener('notification', (e) => {
        errors = 0
        try {
          const raw = JSON.parse((e as MessageEvent<string>).data) as { id?: string; createdAt?: unknown }
          if (!raw.id || typeof raw.createdAt !== 'string') return
          cursor = raw.createdAt
          onNewRef.current()
        } catch { /* malformed: ignored */ }
      })
      source.addEventListener('close', () => {
        source.close()
        es = null
        if (alive && document.visibilityState === 'visible') connect()
      })
      source.onerror = () => {
        source.close()
        es = null
        errors++
        if (errors >= MAX_ERRORS) return
        timer = setTimeout(connect, Math.min(BASE_BACKOFF_MS * 2 ** (errors - 1), 30_000))
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { if (!es) connect() } else stop()
    }

    connect()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [])
}
