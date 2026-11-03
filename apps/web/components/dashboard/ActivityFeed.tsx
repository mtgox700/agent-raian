'use client'

import { useEffect, useState, useCallback } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import {
  UserPlus,
  Mail,
  MessageSquare,
  CheckCircle2,
  Rocket,
  DollarSign,
  RefreshCw,
  Bell,
} from 'lucide-react'
import type { ActivityEvent, ActivityType } from '@/lib/types/dashboard'

/** Cyan = the machine (leads, sends, campaigns), gold = a human (replies, qualification). */
const ACTIVITY_CONFIG: Record<ActivityType, { icon: typeof UserPlus; tone: string }> = {
  lead_added:        { icon: UserPlus,      tone: 'text-cyan' },
  email_sent:        { icon: Mail,          tone: 'text-cyan' },
  reply_received:    { icon: MessageSquare, tone: 'text-gold' },
  lead_qualified:    { icon: CheckCircle2,  tone: 'text-gold' },
  campaign_launched: { icon: Rocket,        tone: 'text-cyan' },
  deal_closed:       { icon: DollarSign,    tone: 'text-success-fg' },
  system:            { icon: Bell,          tone: 'text-muted' },
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchEvents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await fetch('/api/activity?limit=20')
      // Guard against transient non-JSON responses (e.g. a 500 HTML error page
      // when the DB connection drops): parsing those throws "Unexpected token
      // '<'". Skip quietly instead of crashing the console.
      const contentType = res.headers.get('content-type') ?? ''
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json() as { events: ActivityEvent[] }
        setEvents(data.events)
      }
    } catch {
      // Network / parse hiccup: keep the last good data, retry on next tick.
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load
  useEffect(() => { fetchEvents() }, [fetchEvents])

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => fetchEvents(), 30_000)
    return () => clearInterval(id)
  }, [fetchEvents])

  return (
    <div className="flex h-full flex-col rounded-[10px] border border-border bg-obsidian">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-white">
            Activité réelle
          </span>
          <span className="font-mono text-xs text-muted">mise à jour toutes les 30 s</span>
        </div>
        <button
          onClick={() => fetchEvents(true)}
          disabled={refreshing}
          className="flex min-h-[32px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted transition-colors duration-150 ease-signal hover:bg-surface hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          Actualiser
        </button>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-cyan motion-reduce:animate-none" role="status" aria-label="Chargement de l’activité" />
          </div>
        )}
        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <p className="text-xs font-semibold text-white">Aucune activité récente</p>
            <p className="text-xs text-muted">Lancez une campagne pour commencer</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {events.map((event) => {
            const config = ACTIVITY_CONFIG[event.type]
            const Icon = config.icon
            return (
              <m.div
                key={event.id}
                initial={{ opacity: 0, x: -12, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.24, ease: [0.2, 0.7, 0.1, 1] }}
                className="border-b border-border/60 px-4 py-3 last:border-0"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-border bg-surface ${config.tone}`}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-white">{event.title}</span>
                      <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted">{timeAgo(event.timestamp)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{event.description}</p>
                    {event.metadata?.amount && (
                      <span className="mt-1 inline-flex items-center rounded-full border border-success-fg/40 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-success-fg">
                        +{event.metadata.amount.toLocaleString('fr-FR')}{'\u00a0'}€
                      </span>
                    )}
                  </div>
                </div>
              </m.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
