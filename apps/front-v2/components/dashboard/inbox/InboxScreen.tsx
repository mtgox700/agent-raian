'use client'

/**
 * The Reply Inbox: filters and pages in the URL (views.inbox reads them),
 * the list on the left, the open reply on the right (a drawer below lg).
 * Opening a reply marks it read (inbox.markRead) and tells the sidebar badge.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { Badge, Button, EmptyState } from '@/components/ui'
import { Drawer } from '@/components/dashboard/campaign/Drawer'
import { ReplyDetail } from '@/components/dashboard/inbox/ReplyDetail'
import { CLASSIF, inboxCopy as t } from '@/lib/copy/inbox'
import { api } from '@/lib/front/api'
import type { InboxReplyFilter, InboxReplyRow } from '@/lib/front/types-inbox'
import { INBOX_READ_EVENT } from '@/lib/inbox/events'
import { cn } from '@/lib/utils'

// Below Tailwind's lg breakpoint the reply opens in a drawer, not a pane.
const NARROW_QUERY = '(max-width: 1023.98px)'
function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const useIsNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false)

function ReplyListItem({ reply, isSelected, onClick }: { reply: InboxReplyRow; isSelected: boolean; onClick: () => void }) {
  const c = CLASSIF[reply.classification] ?? CLASSIF.NEUTRAL
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      className={cn('relative w-full border-b border-line px-4 py-3 text-left transition-colors duration-200 ease-signal last:border-b-0 focus-visible:outline-offset-[-2px]',
        isSelected ? 'bg-surface' : 'hover:bg-surface/50')}
    >
      {!reply.isRead && (
        <>
          <span aria-hidden="true" className={cn('absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full', c.dot)} />
          <span className="sr-only">{t.unread}</span>
        </>
      )}
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-2">
            <Badge tone={c.tone} className="shrink-0">{c.label}</Badge>
            <span className="truncate text-xs text-quiet">
              {reply.lead.firstName} {reply.lead.lastName}
              {reply.lead.company && <span> · {reply.lead.company}</span>}
            </span>
          </span>
          <span className="line-clamp-2 text-xs leading-snug text-ink/75">{reply.bodySnippet}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-quiet">{t.ago(reply.receivedAt)}</span>
      </span>
    </button>
  )
}

export function InboxScreen({ replies, page, totalPages, filter }: {
  replies: InboxReplyRow[]
  page: number
  totalPages: number
  filter: InboxReplyFilter
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isNarrow = useIsNarrow()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const selected = useMemo(() => replies.find((r) => r.id === selectedId) ?? null, [replies, selectedId])

  // Opened = read. Best effort: never blocks reading; the sidebar badge catches up.
  useEffect(() => {
    if (!selectedId || readIds.has(selectedId)) return
    if (!replies.some((r) => r.id === selectedId)) return
    setReadIds((prev) => new Set(prev).add(selectedId))
    api.call('inbox.markRead', { params: { replyId: selectedId } })
      .then(() => window.dispatchEvent(new Event(INBOX_READ_EVENT)))
      .catch(() => undefined)
  }, [selectedId, readIds, replies])

  const navigate = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString())
    mutate(p)
    const qs = p.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    setSelectedId(null)
  }
  const changeFilter = (next: InboxReplyFilter) => navigate((p) => { p.set('filter', next); p.delete('page') })
  const goToPage = (next: number) => navigate((p) => { if (next === 1) p.delete('page'); else p.set('page', String(next)) })
  const empty = t.empty[filter]

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto" role="group" aria-label={t.filtersLabel}>
        {t.filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => changeFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn('whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ease-signal',
              filter === f.key ? 'border-accent/40 text-ink' : 'border-transparent text-quiet hover:bg-surface hover:text-ink')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {replies.length === 0 ? (
        <div className="flex min-h-[400px] flex-1 items-center justify-center rounded-lg border border-dashed border-line">
          <EmptyState icon={Inbox} title={empty.title}>{empty.subtitle}</EmptyState>
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="overflow-y-auto rounded-lg border border-line bg-raised lg:max-h-[calc(100dvh-260px)]">
              {replies.map((r) => (
                <ReplyListItem key={r.id} reply={{ ...r, isRead: r.isRead || readIds.has(r.id) }} isSelected={selectedId === r.id} onClick={() => setSelectedId(r.id)} />
              ))}
            </div>
            <div className="hidden max-h-[calc(100dvh-260px)] overflow-y-auto rounded-lg border border-line bg-raised lg:block">
              {selected ? <ReplyDetail reply={selected} onClose={() => setSelectedId(null)} /> : (
                <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                  <Inbox className="mb-3 h-8 w-8 text-quiet/40" aria-hidden="true" />
                  <p className="text-sm text-quiet">{t.placeholderTitle}</p>
                  <p className="mt-1 text-xs text-quiet">{t.placeholderBody}</p>
                </div>
              )}
            </div>
          </div>

          <Drawer
            open={isNarrow && selected !== null}
            onClose={() => setSelectedId(null)}
            size="xl"
            closeLabel={t.close}
            title={selected ? `${selected.lead.firstName} ${selected.lead.lastName}` : ''}
          >
            {selected && <div className="-mx-5 -my-4"><ReplyDetail reply={selected} onClose={() => setSelectedId(null)} isMobile /></div>}
          </Drawer>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2" aria-label={t.pagination}>
              <Button variant="outline" size="sm" className="h-8 w-8 px-0" disabled={page <= 1} onClick={() => goToPage(page - 1)} aria-label={t.prev}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="px-3 font-mono text-xs tabular-nums text-quiet">{t.page} <span className="font-semibold text-ink">{page}</span> / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 px-0" disabled={page >= totalPages} onClick={() => goToPage(page + 1)} aria-label={t.next}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
