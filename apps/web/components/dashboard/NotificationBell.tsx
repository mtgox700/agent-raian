'use client'

/**
 * NotificationBell: real-time notification centre
 *
 * • Polls /api/notifications every 30 s (SSE pushes in between)
 * • Unread badge (cyan dot, count from 10)
 * • Portal panel: a non-modal dialog labelled "Notifications", controlled by
 *   the bell (aria-expanded / aria-controls). Focus moves into it on open;
 *   Escape and an outside click close it; every close gives focus back to the bell.
 * • Mark-as-read on click / mark-all button
 * • Tones: gold when a person acted, danger for a refusal, warning for what
 *   needs a look, cyan for what the machine did, neutral otherwise.
 */

import {
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
  KeyboardEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { useSSENotifications } from '@/hooks/use-sse-notifications'
import { createPortal } from 'react-dom'
import { m, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck, Calendar, Flame, ThumbsDown, MessageSquare, Megaphone, AlertTriangle, Bot, X, Download, ChevronRight, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotificationItem } from '@/lib/services/notifications.service'
import type { NotificationType } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FetchResult {
  notifications: NotificationItem[]
  unreadCount: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000

function typeConfig(type: NotificationType): {
  Icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
} {
  switch (type) {
    case 'LEAD_REPLIED_MEETING':
      return { Icon: Calendar,      color: 'text-gold',       bg: 'border-gold/25' }
    case 'LEAD_REPLIED_POSITIVE':
      return { Icon: Flame,         color: 'text-gold',       bg: 'border-gold/25' }
    case 'LEAD_REPLIED_NEGATIVE':
      return { Icon: ThumbsDown,    color: 'text-danger',     bg: 'border-danger/25' }
    case 'LEAD_REPLIED_NEUTRAL':
      return { Icon: MessageSquare, color: 'text-muted',      bg: 'border-border' }
    case 'LEAD_CLICKED_WHATSAPP':
      return { Icon: MessageSquare, color: 'text-gold',       bg: 'border-gold/25' }
    case 'MAILBOX_DISCONNECTED':
    case 'MAILBOX_PAUSED':
      return { Icon: AlertTriangle, color: 'text-warning',    bg: 'border-warning/25' }
    case 'CAMPAIGN_COMPLETED':
      return { Icon: Megaphone,     color: 'text-cyan',       bg: 'border-cyan/25' }
    case 'QUOTA_WARNING':
      return { Icon: AlertTriangle, color: 'text-warning',    bg: 'border-warning/25' }
    case 'SDR_APPROVAL_NEEDED':
      return { Icon: Bot,           color: 'text-cyan',       bg: 'border-cyan/25' }
    case 'EXPORT_READY':
      return { Icon: Download,      color: 'text-cyan',       bg: 'border-cyan/25' }
    case 'INSIGHT_ALERT':
      return { Icon: Siren,         color: 'text-warning',    bg: 'border-warning/25' }
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

// ─── Navigation helper ────────────────────────────────────────────────────────

function resolveNotifUrl(n: NotificationItem): string | null {
  if (n.leadId)     return `/dashboard/leads/hot?lid=${n.leadId}`
  if (n.campaignId) return `/dashboard/campaigns/${n.campaignId}`
  if (n.type === 'EXPORT_READY') return '/dashboard/settings?tab=security'
  if (n.type === 'INSIGHT_ALERT') return '/dashboard#alertes'
  return null
}

// ─── Single notification row ──────────────────────────────────────────────────

interface NotifRowProps {
  n:           NotificationItem
  onRead:      (id: string) => void
  onNavigate:  (url: string) => void
}

function NotifRow({ n, onRead, onNavigate }: NotifRowProps) {
  const { Icon, color, bg } = typeConfig(n.type)
  const isUnread = n.readAt === null
  const url      = resolveNotifUrl(n)

  const handleClick = () => {
    onRead(n.id)
    if (url) onNavigate(url)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 ease-signal hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan',
        isUnread && 'bg-white/[0.025]',
        url && 'cursor-pointer',
      )}
    >
      {/* Icon */}
      <div className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border', bg)}>
        <Icon className={cn('h-3.5 w-3.5', color)} aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-semibold', isUnread ? 'text-white' : 'text-white/60')}>
          {isUnread && <span className="sr-only">Non lue : </span>}
          {n.title}
        </p>
        <p className="mt-0.5 truncate text-xs leading-snug text-muted">
          {n.body}
        </p>
      </div>

      {/* Meta */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <span className="font-mono text-[11px] tabular-nums text-muted">{timeAgo(n.createdAt)}</span>
        <div className="flex items-center gap-1">
          {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden="true" />}
          {url && (
            <ChevronRight className="h-3 w-3 text-muted/60 transition-colors duration-150 ease-signal group-hover:text-cyan" aria-hidden="true" />
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Dropdown panel ───────────────────────────────────────────────────────────

interface PanelProps {
  id:            string
  notifications: NotificationItem[]
  unreadCount:   number
  style:         React.CSSProperties
  onClose:       () => void
  onRead:        (id: string) => void
  onReadAll:     () => void
  onNavigate:    (url: string) => void
}

function NotificationPanel({
  id,
  notifications,
  unreadCount,
  style,
  onClose,
  onRead,
  onReadAll,
  onNavigate,
}: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus moves into the panel when it opens (the panel itself, so a screen
  // reader announces its name before the list).
  useEffect(() => { panelRef.current?.focus() }, [])

  return createPortal(
    <>
      {/* Outside click closes */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} aria-hidden="true" />

      {/* Panel: opening and closing are the only motion */}
      <m.div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-label="Notifications"
        tabIndex={-1}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.16, ease: [0.2, 0.7, 0.1, 1] }}
        className="fixed z-[9999] w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-[10px] border border-border bg-obsidian focus:outline-none"
        style={style}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-bold text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan px-1 font-mono text-[11px] font-bold tabular-nums text-void">
                {unreadCount > 99 ? '99+' : unreadCount}
                <span className="sr-only"> non lues</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onReadAll}
                title="Tout marquer comme lu"
                className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted transition-colors duration-150 ease-signal hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Tout lire
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-signal hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
              aria-label="Fermer les notifications"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border">
                <Bell className="h-5 w-5 text-muted" aria-hidden="true" />
              </div>
              <p className="text-xs text-muted">Aucune notification</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <NotifRow key={n.id} n={n} onRead={onRead} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>
      </m.div>
    </>,
    document.body,
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationBell() {
  const router                              = useRouter()
  const [open, setOpen]                     = useState(false)
  const [mounted, setMounted]               = useState(false)
  const [notifications, setNotifications]   = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount]       = useState(0)
  const [panelPos, setPanelPos]             = useState({ top: 0, right: 0 })
  const btnRef                              = useRef<HTMLButtonElement>(null)
  const panelId                             = useId()

  useEffect(() => { setMounted(true) }, [])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=30')
      if (!res.ok) return
      const data = (await res.json()) as FetchResult
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      // swallow silently: network blip
    }
  }, [])

  // ── SSE: instant push; several arrivals in a row trigger one re-fetch ───
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => { void fetchNotifications() }, 400)
  }, [fetchNotifications])
  useEffect(() => () => { if (refetchTimer.current) clearTimeout(refetchTimer.current) }, [])

  useSSENotifications({ onNew: scheduleRefetch })

  // Initial load + polling (safety-net fallback), paused while the tab is hidden
  useEffect(() => {
    void fetchNotifications()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchNotifications()
    }, POLL_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchNotifications()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchNotifications])

  // Keyboard handler
  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Every close (Escape, outside click, a notification opened, all read) gives
  // focus back to the bell, unless the user already moved it somewhere else.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) { wasOpen.current = true; return }
    if (!wasOpen.current) return
    wasOpen.current = false
    const active = document.activeElement
    const panel = document.getElementById(panelId)
    if (!active || active === document.body || panel?.contains(active)) btnRef.current?.focus()
  }, [open, panelId])

  // ── Interaction ────────────────────────────────────────────────────────────

  const openPanel = () => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    // `rect.bottom` is already viewport-relative: no scrollY needed for position:fixed
    setPanelPos({
      top:   rect.bottom + 8,
      right: window.innerWidth - rect.right,
    })
    setOpen(true)
  }

  const handleToggle = () => (open ? setOpen(false) : openPanel())

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggle()
    }
  }

  const handleRead = (id: string) => {
    // Only decrement if the notification was genuinely unread
    const target = notifications.find((n) => n.id === id)
    const wasUnread = target?.readAt === null

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    )
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1))

    // Fire-and-forget: any failure will reconcile on the next 30s poll
    void fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => undefined)
  }

  const handleNavigate = useCallback((url: string) => {
    setOpen(false)
    router.push(url)
  }, [router])

  const handleReadAll = () => {
    // Optimistic update
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })))
    setUnreadCount(0)
    setOpen(false)

    // Fire-and-forget
    void fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => undefined)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan',
          open
            ? 'border-cyan/40 text-white'
            : 'border-border text-muted hover:border-white/20 hover:text-white',
        )}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute flex items-center justify-center rounded-full bg-cyan font-mono font-bold tabular-nums text-void',
              unreadCount > 9
                ? '-right-1.5 -top-1.5 h-4 min-w-[16px] px-0.5 text-[9px]'
                : 'right-1 top-1 h-1.5 w-1.5',
            )}
          >
            {unreadCount > 9 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : ''}
          </span>
        )}
      </button>

      {/* Panel portal */}
      {mounted && (
        <AnimatePresence>
          {open && (
            <NotificationPanel
              id={panelId}
              notifications={notifications}
              unreadCount={unreadCount}
              style={{ top: panelPos.top, right: panelPos.right }}
              onClose={() => setOpen(false)}
              onRead={handleRead}
              onReadAll={handleReadAll}
              onNavigate={handleNavigate}
            />
          )}
        </AnimatePresence>
      )}
    </>
  )
}
