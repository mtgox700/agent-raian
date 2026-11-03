'use client'

/**
 * Historique: unified activity & campaign timeline.
 *
 * Design (Lena): sober day-grouped timeline on the brand surface, one accent
 * per event kind (cyan: the machine ran a campaign; gold: a person
 * answered; muted: the system), no load-time entrances (CLS lesson: see
 * TEAM_MEMORY 2026-06-25). The only motion is a border colour on hover.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { History, Megaphone, MessageSquare, Bell, Filter, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type { HistoryEvent } from '@/lib/views/history'
import type { HistoryEvent } from '@/lib/views/history'

const KIND_META: Record<HistoryEvent['kind'], { label: string; icon: typeof Bell; text: string; dot: string }> = {
  campaign: { label: 'Campagnes', icon: Megaphone,     text: 'text-cyan',  dot: 'bg-cyan' },
  reply:    { label: 'Réponses',  icon: MessageSquare, text: 'text-gold',  dot: 'bg-gold' },
  system:   { label: 'Système',   icon: Bell,          text: 'text-muted', dot: 'bg-muted' },
}

const FILTERS: { key: HistoryEvent['kind'] | 'all'; label: string }[] = [
  { key: 'all',      label: 'Tout' },
  { key: 'campaign', label: 'Campagnes' },
  { key: 'reply',    label: 'Réponses' },
  { key: 'system',   label: 'Système' },
]

const BATCH = 30

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return "Aujourd'hui"
  if (sameDay(d, yesterday)) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function HistoryPageClient({ events }: { events: HistoryEvent[] }) {
  const [filter, setFilter] = useState<HistoryEvent['kind'] | 'all'>('all')
  const [visibleCount, setVisibleCount] = useState(BATCH)

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  )
  const visible   = filtered.slice(0, visibleCount)
  const remaining = filtered.length - visible.length

  // Group the visible slice by calendar day, preserving order.
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
    const c: Record<string, number> = { all: events.length, campaign: 0, reply: 0, system: 0 }
    for (const e of events) c[e.kind]++
    return c
  }, [events])

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header (static: load-time entrances cost CLS) ────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-obsidian">
            <History className="h-4 w-4 text-cyan" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Historique</h1>
            <p className="text-xs text-muted">
              Le journal complet de vos campagnes et activités
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer le journal">
        <Filter className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setFilter(key); setVisibleCount(BATCH) }}
            aria-pressed={filter === key}
            className={cn(
              'rounded-md border px-3 py-1 text-xs font-semibold transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan',
              filter === key
                ? 'border-cyan/40 text-white'
                : 'border-transparent text-muted hover:bg-white/[0.04] hover:text-white',
            )}
          >
            {label}
            <span className="ml-1.5 font-mono text-[11px] tabular-nums text-muted">{counts[key]}</span>
          </button>
        ))}
      </div>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border py-16">
          <History className="h-6 w-6 text-muted" aria-hidden="true" />
          <p className="text-sm font-semibold text-white">
            {events.length === 0 ? "Aucune activité pour l'instant" : 'Rien dans cette catégorie'}
          </p>
          <p className="text-xs text-muted">
            {events.length === 0 ? 'Lancez votre première campagne pour remplir ce journal.' : 'Choisissez un autre filtre pour voir le reste du journal.'}
          </p>
        </div>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────────── */}
      {groups.map(([day, dayEvents]) => (
        <section key={day} aria-label={day}>
          {/* Day separator */}
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-mono text-xs text-muted first-letter:uppercase">
              {day}
            </h2>
            <div className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <ol className="relative ml-2 space-y-2 border-l border-border pl-5">
            {dayEvents.map((e) => {
              const meta = KIND_META[e.kind]
              const Icon = meta.icon
              const inner = (
                <div className={cn(
                  'relative rounded-[10px] border border-border bg-obsidian p-3.5',
                  e.href && 'transition-colors duration-150 ease-signal hover:border-cyan/40',
                )}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border">
                      <Icon className={cn('h-3.5 w-3.5', meta.text)} aria-hidden="true" />
                      <span className="sr-only">{meta.label}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-white">{e.title}</p>
                        <time dateTime={e.createdAt} className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted">
                          {timeLabel(e.createdAt)}
                        </time>
                      </div>
                      {e.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
                          {e.body}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Timeline node */}
                  <span
                    className={cn('absolute -left-[26px] top-5 h-2 w-2 rounded-full border-2 border-void', meta.dot)}
                    aria-hidden="true"
                  />
                </div>
              )
              return (
                <li key={e.id}>
                  {e.href ? <Link href={e.href} className="block rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan">{inner}</Link> : inner}
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      {/* ── Show more ─────────────────────────────────────────────────────── */}
      {remaining > 0 && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + BATCH)}>
            <ChevronDown className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Afficher plus
            <span className="ml-2 font-mono text-xs tabular-nums text-muted">
              {remaining} restant{remaining > 1 ? 's' : ''}
            </span>
          </Button>
        </div>
      )}
    </div>
  )
}
