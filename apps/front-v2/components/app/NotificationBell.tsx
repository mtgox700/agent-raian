'use client'

/**
 * The notification centre, as in body n°1: list + unread count from
 * notifications.list (every 30 s while visible, and at once when the stream
 * pushes one), mark one read on click (then go where it points), mark all.
 * The panel is a non-modal dialog controlled by the bell: focus moves into
 * it, Escape and an outside click close it, focus returns to the bell.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Bell, Bot, Calendar, CheckCheck, ChevronRight, Download, Flame,
  Megaphone, MessageSquare, Siren, ThumbsDown, X, type LucideIcon,
} from 'lucide-react'
import type { CallOutput } from '@phantera/sdk'
import { notificationsCopy as t } from '@/lib/app-copy'
import { api } from '@/lib/front/api'
import { useNotificationStream } from '@/lib/front/use-notification-stream'
import { cn } from '@/lib/utils'

type Item = CallOutput<'notifications.list'>['notifications'][number]

const POLL_INTERVAL_MS = 30_000

/** Tones: signal when a person acted, danger for a refusal, warning for a look, accent for the machine. */
const TYPE: Record<Item['type'], { Icon: LucideIcon; tone: string }> = {
  LEAD_REPLIED_MEETING:  { Icon: Calendar,      tone: 'text-signal border-signal/25' },
  LEAD_REPLIED_POSITIVE: { Icon: Flame,         tone: 'text-signal border-signal/25' },
  LEAD_REPLIED_NEGATIVE: { Icon: ThumbsDown,    tone: 'text-danger border-danger/25' },
  LEAD_REPLIED_NEUTRAL:  { Icon: MessageSquare, tone: 'text-quiet border-line' },
  LEAD_CLICKED_WHATSAPP: { Icon: MessageSquare, tone: 'text-signal border-signal/25' },
  MAILBOX_DISCONNECTED:  { Icon: AlertTriangle, tone: 'text-warning border-warning/25' },
  MAILBOX_PAUSED:        { Icon: AlertTriangle, tone: 'text-warning border-warning/25' },
  CAMPAIGN_COMPLETED:    { Icon: Megaphone,     tone: 'text-accent border-accent/25' },
  QUOTA_WARNING:         { Icon: AlertTriangle, tone: 'text-warning border-warning/25' },
  SDR_APPROVAL_NEEDED:   { Icon: Bot,           tone: 'text-accent border-accent/25' },
  EXPORT_READY:          { Icon: Download,      tone: 'text-accent border-accent/25' },
  INSIGHT_ALERT:         { Icon: Siren,         tone: 'text-warning border-warning/25' },
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return t.justNow
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function targetOf(n: Item): string | null {
  if (n.leadId) return `/dashboard/leads/hot?lid=${n.leadId}`
  if (n.campaignId) return `/dashboard/campaigns/${n.campaignId}`
  if (n.type === 'EXPORT_READY') return '/dashboard/settings?tab=security'
  if (n.type === 'INSIGHT_ALERT') return '/dashboard#alertes'
  return null
}

const countLabel = (n: number) => (n > 99 ? '99+' : String(n))

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const load = useCallback(async () => {
    try {
      const data = await api.call('notifications.list', { query: { limit: '30' } })
      setItems(data.notifications)
      setUnread(data.unreadCount)
    } catch { /* network blip: the next poll reconciles */ }
  }, [])

  // Several pushes in a row trigger one reload.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleReload = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => { void load() }, 400)
  }, [load])
  useEffect(() => () => { if (refetchTimer.current) clearTimeout(refetchTimer.current) }, [])
  useNotificationStream(scheduleReload)

  // First load + polling safety net, paused while the tab is hidden.
  useEffect(() => {
    void load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_INTERVAL_MS)
    const onVisibility = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [load])

  const close = useCallback(() => {
    setOpen(false)
    const active = document.activeElement
    if (!active || active === document.body || panelRef.current?.contains(active)) btnRef.current?.focus()
  }, [])

  // Escape and an outside click close; focus moves into the panel on open.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panelRef.current?.contains(target) && !btnRef.current?.contains(target)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open, close])

  const markRead = (n: Item) => {
    if (n.readAt === null) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      setUnread((c) => Math.max(0, c - 1))
      // Fire and forget: the next poll reconciles a failure.
      void api.call('notifications.markRead', { params: { id: n.id } }).catch(() => undefined)
    }
    const url = targetOf(n)
    if (url) { setOpen(false); router.push(url) }
  }

  const markAll = () => {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? now })))
    setUnread(0)
    close()
    void api.call('notifications.markAllRead', {}).catch(() => undefined)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={t.bellLabel(unread)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-md border transition-colors duration-200 ease-signal',
          open ? 'border-accent/50 text-ink' : 'border-line text-quiet hover:border-quiet/60 hover:text-ink',
        )}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute flex items-center justify-center rounded-full bg-accent font-mono font-bold tabular-nums text-canvas',
              unread > 9 ? '-right-1.5 -top-1.5 h-4 min-w-[16px] px-0.5 text-[9px]' : 'right-1.5 top-1.5 h-1.5 w-1.5',
            )}
          >
            {unread > 9 ? countLabel(unread) : ''}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t.title}
          tabIndex={-1}
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-raised focus:outline-none"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-ink">{t.title}</h2>
              {unread > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[11px] font-bold tabular-nums text-canvas">
                  {countLabel(unread)}<span className="sr-only">{t.unreadSuffix}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={markAll} title={t.readAllTitle}
                  className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink">
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.readAll}
                </button>
              )}
              <button type="button" onClick={close} aria-label={t.close}
                className="flex h-8 w-8 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line">
                  <Bell className="h-5 w-5 text-quiet" aria-hidden="true" />
                </span>
                <p className="text-xs text-quiet">{t.empty}</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => {
                  const { Icon, tone } = TYPE[n.type]
                  const isUnread = n.readAt === null
                  const url = targetOf(n)
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => markRead(n)}
                        className={cn(
                          'group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-200 ease-signal hover:bg-surface focus-visible:-outline-offset-2',
                          isUnread && 'bg-surface/50',
                        )}
                      >
                        <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border', tone)}>
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-xs font-semibold', isUnread ? 'text-ink' : 'text-ink/60')}>
                            {isUnread && <span className="sr-only">{t.unreadPrefix}</span>}
                            {n.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs leading-snug text-quiet">{n.body}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="font-mono text-[11px] tabular-nums text-quiet">{timeAgo(n.createdAt)}</span>
                          <span className="flex items-center gap-1">
                            {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
                            {url && <ChevronRight className="h-3 w-3 text-quiet/60 transition-colors duration-200 ease-signal group-hover:text-accent" aria-hidden="true" />}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
