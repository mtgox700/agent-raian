'use client'

/**
 * Reply Inbox: client UI.
 *
 * Layout:
 *   ┌─ Header (count + filter tabs)
 *   ├─ Two-pane on desktop : list (left) · detail (right)
 *   └─ Single-pane on mobile : list -> tap -> detail in a drawer
 */

import { INBOX_READ_EVENT } from '@/lib/inbox/events'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Inbox, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics/events'
import type { ReplyFilter } from '@/lib/repositories/replies.repository'
import { CLASSIF, ReplyDetail, type ReplyRow } from './ReplyDetail'

// ─── Props ──────────────────────────────────────────────────────────────

interface Props {
  replies:    ReplyRow[]
  total:      number
  page:       number
  totalPages: number
  filter:     ReplyFilter
}

const FILTERS: { key: ReplyFilter; label: string }[] = [
  { key: 'all',      label: 'Toutes' },
  { key: 'positive', label: 'Positives' },
  { key: 'meeting',  label: 'Rendez-vous' },
  { key: 'negative', label: 'Négatives' },
  { key: 'unread',   label: 'Non lues' },
]

// ─── Helpers ────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1)    return "à l'instant"
  if (min < 60)   return `il y a ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24)    return `il y a ${hr} h`
  const days = Math.floor(hr / 24)
  if (days < 7)   return `il y a ${days} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Below Tailwind's lg breakpoint the detail opens in a drawer, not a pane.
const NARROW_QUERY = '(max-width: 1023.98px)'
function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
}

// ─── Component ──────────────────────────────────────────────────────────

export function InboxPageClient({ replies, total, page, totalPages, filter }: Props) {
  const router         = useRouter()
  const searchParams   = useSearchParams()
  const isNarrow       = useIsNarrow()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [readIds,   setReadIds]   = useState<Set<string>>(new Set())
  const selectedReply  = useMemo(() => replies.find((r) => r.id === selectedId) ?? null, [replies, selectedId])

  // Auto mark-as-read when a reply is opened + analytics
  useEffect(() => {
    if (!selectedId) return
    if (readIds.has(selectedId)) return

    const reply = replies.find((r) => r.id === selectedId)
    if (!reply) return

    setReadIds((prev) => new Set(prev).add(selectedId))
    track('inbox_reply_opened', {
      classification: reply.classification,
      confidence:     reply.confidence,
    })
    // Best effort, never blocks reading. Once saved, the sidebar badge
    // catches up; the open reply stays on screen until the next visit.
    void fetch(`/api/inbox/${selectedId}/read`, { method: 'POST' })
      .then((res) => { if (res.ok) window.dispatchEvent(new Event(INBOX_READ_EVENT)) })
      .catch(() => undefined)
  }, [selectedId, readIds, replies])

  const changeFilter = (next: ReplyFilter) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('filter', next)
    p.delete('page')
    router.push(`?${p.toString()}`)
    setSelectedId(null)
  }

  const goToPage = (next: number) => {
    const p = new URLSearchParams(searchParams.toString())
    if (next === 1) p.delete('page')
    else            p.set('page', String(next))
    router.push(`?${p.toString()}`)
    setSelectedId(null)
  }

  return (
    <div className="flex h-full flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mb-5">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-obsidian">
            <Inbox className="h-4 w-4 text-gold" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Réponses</h1>
            <p className="text-xs text-muted">
              <span className="font-mono tabular-nums text-white">{total}</span> réponse{total > 1 ? 's' : ''}{' · '}classées automatiquement
            </p>
          </div>
        </div>
      </header>

      {/* ── Filter tabs ────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Filtrer les réponses">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => changeFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              'whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan',
              filter === f.key
                ? 'border-cyan/40 text-white'
                : 'border-transparent text-muted hover:bg-white/[0.04] hover:text-white',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {replies.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <>
          {/* ── List + detail layout ──────────────────────────────────── */}
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">

            {/* Left: list */}
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto rounded-[10px] border border-border bg-obsidian">
              {replies.map((r) => (
                <ReplyListItem
                  key={r.id}
                  reply={{ ...r, isRead: r.isRead || readIds.has(r.id) }}
                  isSelected={selectedId === r.id}
                  onClick={() => setSelectedId(r.id)}
                />
              ))}
            </div>

            {/* Right: detail (desktop) */}
            <div className="hidden max-h-[calc(100vh-280px)] overflow-y-auto rounded-[10px] border border-border bg-obsidian lg:block">
              {selectedReply
                ? <ReplyDetail reply={selectedReply} onClose={() => setSelectedId(null)} />
                : <DetailPlaceholder />
              }
            </div>
          </div>

          {/* Mobile: the detail opens in a drawer (focus kept inside, Escape closes) */}
          <Dialog
            open={isNarrow && selectedReply !== null}
            onClose={() => setSelectedId(null)}
            variant="drawer"
            size="xl"
            title={selectedReply ? `${selectedReply.lead.firstName} ${selectedReply.lead.lastName}` : ''}
          >
            {selectedReply && (
              <div className="-mx-5 -my-5">
                <ReplyDetail reply={selectedReply} onClose={() => setSelectedId(null)} isMobile />
              </div>
            )}
          </Dialog>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Pagination des réponses">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="px-3 font-mono text-xs tabular-nums text-muted">
                Page <span className="font-semibold text-white">{page}</span> / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
                aria-label="Page suivante"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────

function ReplyListItem({
  reply,
  isSelected,
  onClick,
}: {
  reply:       ReplyRow
  isSelected:  boolean
  onClick:     () => void
}) {
  const c = CLASSIF[reply.classification]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'relative w-full border-b border-border px-4 py-3 text-left transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan',
        isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]',
      )}
    >
      {!reply.isRead && (
        <>
          <span
            aria-hidden="true"
            className={cn('absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full', c.dot)}
          />
          <span className="sr-only">Non lue. </span>
        </>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <StatusBadge tone={c.tone} className="flex-shrink-0">{c.label}</StatusBadge>
            <span className="truncate text-xs text-muted">
              {reply.lead.firstName} {reply.lead.lastName}
              {reply.lead.company && (
                <span className="text-muted"> · {reply.lead.company}</span>
              )}
            </span>
          </div>

          <p className="line-clamp-2 text-xs leading-snug text-white/75">
            {reply.bodySnippet}
          </p>
        </div>

        <span className="flex-shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-muted">
          {timeAgo(reply.receivedAt)}
        </span>
      </div>
    </button>
  )
}

function DetailPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <Inbox className="mb-3 h-8 w-8 text-muted/40" aria-hidden="true" />
      <p className="text-sm text-muted">Sélectionnez une réponse pour la lire en entier</p>
      <p className="mt-1 text-xs text-muted">
        Chaque réponse est classée automatiquement
      </p>
    </div>
  )
}

function EmptyState({ filter }: { filter: ReplyFilter }) {
  const copy: Record<ReplyFilter, { title: string; subtitle: string }> = {
    all:      { title: 'Aucune réponse pour le moment', subtitle: "Lancez une campagne : les réponses arriveront ici, classées automatiquement." },
    positive: { title: 'Aucune réponse positive',     subtitle: 'Les réponses positives apparaîtront ici.' },
    meeting:  { title: 'Aucune demande de rendez-vous', subtitle: "Quand un prospect propose un échange, il apparaît ici." },
    negative: { title: 'Aucune réponse négative',     subtitle: 'Les refus et les « pas intéressé » apparaîtront ici.' },
    unread:   { title: 'Tout est lu',                 subtitle: 'Aucune réponse non lue.' },
  }
  const text = copy[filter]

  return (
    <div className="flex min-h-[400px] flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] border border-border bg-obsidian">
        <Inbox className="h-6 w-6 text-muted" aria-hidden="true" />
      </div>
      <h2 className="font-display text-lg font-bold text-white">{text.title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted">{text.subtitle}</p>
    </div>
  )
}
