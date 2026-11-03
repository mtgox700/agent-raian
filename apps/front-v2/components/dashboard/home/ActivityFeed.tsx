'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCircle2, DollarSign, Mail, MessageSquare, RefreshCw, Rocket, UserPlus, type LucideIcon } from 'lucide-react'
import { EmptyState, Panel, Skeleton } from '@/components/ui'
import { home } from '@/lib/app-copy'
import { api } from '@/lib/front/api'
import type { ActivityEvent } from '@/lib/front/types'
import { cn } from '@/lib/utils'

const t = home.activity

/** Accent = the machine (leads, sends, campaigns), signal = a person (replies, qualification). */
const TYPE: Record<ActivityEvent['type'], { Icon: LucideIcon; tone: string }> = {
  lead_added:        { Icon: UserPlus,      tone: 'text-accent' },
  email_sent:        { Icon: Mail,          tone: 'text-accent' },
  reply_received:    { Icon: MessageSquare, tone: 'text-signal' },
  lead_qualified:    { Icon: CheckCircle2,  tone: 'text-signal' },
  campaign_launched: { Icon: Rocket,        tone: 'text-accent' },
  deal_closed:       { Icon: DollarSign,    tone: 'text-success' },
  system:            { Icon: Bell,          tone: 'text-quiet' },
}

/** The workspace's real activity (activity.list), refreshed every 30 s and on demand. */
export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const data = await api.call('activity.list', { query: { limit: '20' } })
      setEvents(data.events)
    } catch {
      // Network or server hiccup: keep the last good list, retry on the next tick.
      setEvents((prev) => prev ?? [])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <Panel
      padded={false}
      title={t.title}
      meta={t.refreshNote}
      action={
        <button type="button" onClick={() => void load(true)} disabled={refreshing}
          className="flex min-h-[32px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink disabled:opacity-40">
          <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
          {t.refresh}
        </button>
      }
      className="flex h-full max-h-[380px] flex-col"
    >
      <div className="flex-1 overflow-y-auto" aria-busy={events === null}>
        {events === null && (
          <div className="space-y-3 p-4" role="status" aria-label={t.loading}>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        )}
        {events?.length === 0 && <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState>}
        {events && events.length > 0 && (
          <ul>
            {events.map((event) => {
              const { Icon, tone } = TYPE[event.type]
              return (
                <li key={event.id} className="border-b border-line/60 px-4 py-3 last:border-0">
                  <div className="flex items-start gap-3">
                    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-surface', tone)}>
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-ink">{event.title}</span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-quiet">{t.ago(event.timestamp)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-quiet">{event.description}</p>
                      {event.metadata?.amount ? (
                        <span className="mt-1 inline-flex items-center rounded-full border border-success/40 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-success">
                          +{event.metadata.amount.toLocaleString('fr-FR')}{' '}€
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}
