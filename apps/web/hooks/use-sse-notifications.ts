'use client'

/**
 * useSSENotifications
 *
 * Connects to /api/notifications/stream (SSE) for near-instant notification delivery.
 * Falls back to the caller's existing polling mechanism after MAX_ERRORS consecutive failures.
 *
 * Flow:
 *  1. Opens EventSource on mount
 *  2. On each `notification` event -> calls onNew() + bumps newCount
 *  3. On normal `close` event (server sends after 20s) -> reconnects with updated cursor
 *  4. On EventSource error -> exponential backoff, then polling fallback after MAX_ERRORS
 *
 * The caller (NotificationBell) still runs its own 30s polling as safety net
 * this hook only adds the instant-push layer on top.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SSENotificationPayload {
  id:         string
  type:       string
  title:      string
  body:       string
  createdAt:  string
  readAt:     string | null
  leadId:     string | null
  campaignId: string | null
}

interface UseSSENotificationsOptions {
  /** Called immediately when a new notification arrives via SSE */
  onNew?: (notification: SSENotificationPayload) => void
  /** Initial cursor: defaults to now (the caller loads the history itself) */
  since?: string
}

interface UseSSENotificationsResult {
  /** Number of new notifications received since mount (SSE only) */
  sseNewCount: number
  /** Most recently received notification (SSE only), or null */
  latest: SSENotificationPayload | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ERRORS = 3
const BASE_BACKOFF_MS = 1_000   // 1s -> 2s -> 4s (capped at 30s)

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSSENotifications(
  options: UseSSENotificationsOptions = {},
): UseSSENotificationsResult {
  const { onNew, since: initialSince } = options

  const [sseNewCount, setSseNewCount] = useState(0)
  const [latest, setLatest]           = useState<SSENotificationPayload | null>(null)

  const errorCountRef = useRef(0)
  const cursorRef     = useRef<string>(
    // Starting a minute back replayed recent notifications on every page
    // load, and each replay made the bell refetch its whole list.
    initialSince ?? new Date().toISOString(),
  )
  const esRef          = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onNewRef       = useRef(onNew)
  const mountedRef     = useRef(true)

  // Keep onNew ref current without re-creating the SSE connection
  useEffect(() => { onNewRef.current = onNew }, [onNew])

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (errorCountRef.current >= MAX_ERRORS) return  // polling fallback active

    // Close any stale connection
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    const url = `/api/notifications/stream?since=${encodeURIComponent(cursorRef.current)}`
    const es  = new EventSource(url)
    esRef.current = es
    // A connection that opens is healthy again: transient errors spread over
    // a long session must not disable push for good.
    es.onopen = () => { errorCountRef.current = 0 }

    es.addEventListener('notification', (e) => {
      if (!mountedRef.current) return
      errorCountRef.current = 0  // reset on successful message

      try {
        // JSON.parse returns unknown: validate before use to avoid cursor corruption
        const raw = JSON.parse(e.data) as Partial<SSENotificationPayload>
        if (!raw.id || !raw.createdAt || typeof raw.createdAt !== 'string') return

        const payload = raw as SSENotificationPayload
        cursorRef.current = payload.createdAt  // advance cursor
        setSseNewCount((c) => c + 1)
        setLatest(payload)
        onNewRef.current?.(payload)
      } catch {
        // Malformed JSON — ignore
      }
    })

    // Normal close sent by server after 20s: reconnect, unless the tab is
    // hidden: a background tab reopened a serverless stream every 20 s.
    es.addEventListener('close', () => {
      if (!mountedRef.current) return
      es.close()
      esRef.current = null
      if (mountedRef.current && document.visibilityState === 'visible') connect()
    })

    es.onerror = () => {
      if (!mountedRef.current) return
      es.close()
      esRef.current = null
      errorCountRef.current++

      if (errorCountRef.current >= MAX_ERRORS) {
        // Give up on SSE: the 30s polling in NotificationBell takes over
        return
      }

      // Exponential backoff: 1s, 2s, 4s (max 30s)
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (errorCountRef.current - 1), 30_000)
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, delay)
    }
  }, [])  // `connect` references itself via closure: stable

  useEffect(() => {
    // SSE is not available in all environments (e.g. SSR, some older browsers)
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

    mountedRef.current = true
    connect()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!esRef.current) connect()
      } else {
        cleanup()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      cleanup()
    }
  }, [connect, cleanup])

  return { sseNewCount, latest }
}
