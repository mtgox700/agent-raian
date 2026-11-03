'use client'

/**
 * The journal: campaign events and notifications, newest first, grouped by
 * day on one hairline rail. One tone per kind (accent: the machine ran a
 * campaign; signal: a person answered; quiet: the system). No load-time
 * entrance; the only motion is a border colour on hover.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, ChevronDown, Filter, History, Megaphone, MessageSquare } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { historyCopy as t } from '@/lib/copy/history'
import type { HistoryEvent, HistoryKind } from '@/lib/front/types-history'
import { cn } from '@/lib/utils'

const KIND_META: Record<HistoryKind, { icon: typeof Bell; text: string; dot: string }> = {
  campaign: { icon: Megaphone,     text: 'text-accent', dot: 'bg-accent' },
  reply:    { icon: MessageSquare, text: 'text-signal', dot: 'bg-signal' },
  system:   { icon: Bell,          text: 'text-quiet',  dot: 'bg-quiet' },
}

const FILTERS: Array<HistoryKind | 'all'> = ['all', 'campaign', 'reply', 'system']

const BATCH = 30

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return t.today
  if (sameDay(d, yesterday)) return t.yesterday
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export function HistoryTimeline({ events }: { events: HistoryEvent[] }) {
  const [filter, setFilter] = useState<HistoryKind | 'all'>('all')
  const [visibleCount, setVisibleCount] = useState(BATCH)

  const filtered = useMemo(() => (filter === 'all' ? events : events.filter((e) => e.kind === filter)), [events, filter])
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const remaining = filtered.length - visible.length

  // The visible slice grouped by calendar day, order kept.
  const groups = useMemo(() => {
    const map = new Map<string, HistoryEvent[]>()
    for (const e of visible) {
      const key = dayLabel(e.createdAt)
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return [...map.entries()]
  }, [visible])

  const counts = useMemo(() => {
    const c: Record<HistoryKind | 'all', number> = { all: events.length, campaign: 0, reply: 0, system: 0 }
    for (const e of events) c[e.kind]++
    return c
  }, [events])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.filterLabel}>
        <Filter className="mr-1 h-3.5 w-3.5 text-quiet" aria-hidden="true" />
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => { setFilter(key); setVisibleCount(BATCH) }}
            aria-pressed={filter === key}
            className={cn(
              'flex min-h-[32px] items-center rounded-md border px-3 text-xs font-medium transition-colors duration-200 ease-signal',
              filter === key ? 'border-accent/50 text-ink' : 'border-transparent text-quiet hover:bg-surface hover:text-ink',
            )}
          >
            {t.filters[key]}
            <span className="ml-1.5 font-mono text-[11px] tabular-nums text-quiet">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-line">
          <EmptyState icon={History} title={events.length === 0 ? t.emptyTitle : t.emptyFilterTitle} className="py-14">
            {events.length === 0 ? t.emptyBody : t.emptyFilterBody}
          </EmptyState>
        </div>
      )}

      {groups.map(([day, dayEvents]) => (
        <section key={day} aria-label={day}>
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-mono text-xs text-quiet first-letter:uppercase">{day}</h2>
            <div className="h-px flex-1 bg-line" aria-hidden="true" />
          </div>

          <ol className="relative ml-2 space-y-2 border-l border-line pl-5">
            {dayEvents.map((e) => {
              const meta = KIND_META[e.kind]
              const Icon = meta.icon
              const inner = (
                <div className={cn('relative rounded-lg border border-line bg-raised p-3.5', e.href && 'transition-colors duration-200 ease-signal hover:border-accent/50')}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
                      <Icon className={cn('h-3.5 w-3.5', meta.text)} aria-hidden="true" />
                      <span className="sr-only">{t.kind[e.kind]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                        <time dateTime={e.createdAt} className="shrink-0 font-mono text-[11px] tabular-nums text-quiet">{timeLabel(e.createdAt)}</time>
                      </div>
                      {e.body && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-quiet">{e.body}</p>}
                    </div>
                  </div>
                  {/* The node on the rail. */}
                  <span className={cn('absolute -left-[26px] top-5 h-2 w-2 rounded-full ring-2 ring-canvas', meta.dot)} aria-hidden="true" />
                </div>
              )
              return (
                <li key={e.id}>
                  {e.href ? <Link href={e.href} className="block rounded-lg">{inner}</Link> : inner}
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      {remaining > 0 && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + BATCH)}>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            {t.more}
            <span className="font-mono text-xs tabular-nums text-quiet">{t.remaining(remaining)}</span>
          </Button>
        </div>
      )}
    </div>
  )
}
