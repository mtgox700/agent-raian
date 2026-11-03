'use client'

/**
 * L'Analyste. One column of conversation, the author's past threads on the
 * side (a panel on mobile). The answer is shown once verified; while it is
 * prepared, the steps of the work are. Data: analyst.* through the contract.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, FlaskConical, Loader2, Lock, MessageSquare, PanelLeft, Plus, Trash2 } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Badge, Button, buttonVariants } from '@/components/ui'
import { analystCopy as t } from '@/lib/copy/analyst'
import { api } from '@/lib/front/api'
import type { AnalystOverview, ChatMessage, ConversationSummary, Evidence, ProgressEvent, StoredMessage, Suggestion } from '@/lib/front/types-analyst'
import { cn } from '@/lib/utils'
import { AnswerView } from './AnswerView'
import { Composer } from './Composer'
import { ProgressView } from './ProgressView'
import { ask } from './stream'

/** Suggestions drawn from a blocking diagnosis come first in the eye: warning; alerts: accent; the rest: neutral. */
const TONE: Record<Suggestion['tone'], string> = {
  bloquant: 'border-warning/40 hover:border-warning',
  alerte: 'border-accent/30 hover:border-accent',
  neutre: 'border-line hover:border-ink/30',
}

const toChat = (m: StoredMessage): ChatMessage => ({
  id: m.id,
  role: m.role === 'user' ? 'user' : 'assistant',
  content: m.content,
  status: m.status,
  evidence: Array.isArray(m.evidence) ? (m.evidence as Evidence[]) : null,
})

export function AnalystScreen({ initialQuestion = '' }: { initialQuestion?: string }) {
  const [overview, setOverview] = useState<AnalystOverview | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState<ProgressEvent[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  // The latest conversation opened: a slower earlier response is dropped.
  const openToken = useRef(0)

  const load = useCallback(async () => {
    setRetrying(true)
    try {
      const data = await api.call('analyst.overview', {})
      setOverview(data)
      setLoadError(false)
      // The diagnosis-based suggestions take a few seconds: they come after.
      if (data.mode !== 'none' && data.quota.limit > 0) {
        api.call('analyst.suggestions', {})
          .then((d) => { if (d.suggestions.length) setOverview((o) => (o ? { ...o, suggestions: d.suggestions } : o)) })
          .catch(() => undefined)
      }
    } catch (err) {
      // An expired session: the middleware sends the reload to sign-in.
      if (err instanceof ApiError && err.status === 401) { window.location.reload(); return }
      setLoadError(true)
    } finally {
      setRetrying(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])
  // The question from a campaign link is in the composer now: a reload must not bring it back.
  useEffect(() => {
    if (initialQuestion) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [initialQuestion])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [messages, pending, notice])

  const open = async (id: string) => {
    if (pending !== null) return
    const token = ++openToken.current
    setDrawer(false)
    setNotice(null)
    setOpening(id)
    try {
      const { conversation } = await api.call('analyst.getConversation', { params: { id } })
      if (token !== openToken.current) return
      setConversationId(conversation.id)
      setMessages(conversation.messages.map(toChat))
    } catch (err) {
      if (token !== openToken.current) return
      if (err instanceof ApiError && err.status === 404) { setNotice(t.notices.gone); void load(); return }
      setNotice(t.notices.openFailed)
    } finally {
      if (token === openToken.current) setOpening(null)
    }
  }

  const fresh = () => {
    if (pending !== null) return
    openToken.current++
    setOpening(null)
    setConversationId(null)
    setMessages([])
    setNotice(null)
    setDrawer(false)
  }

  const remove = async (id: string) => {
    setConfirmDelete(null)
    try {
      await api.call('analyst.deleteConversation', { params: { id } })
    } catch (err) {
      // Already gone elsewhere: the goal is reached.
      if (!(err instanceof ApiError && err.status === 404)) { setNotice(t.notices.deleteFailed); return }
    }
    if (id === conversationId) fresh()
    setOverview((o) => (o ? { ...o, conversations: o.conversations.filter((c) => c.id !== id) } : o))
  }

  const send = async (question: string) => {
    setNotice(null)
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: question }])
    setPending([])
    await ask(question, conversationId, {
      onProgress: (e) => setPending((cur) => [...(cur ?? []), e]),
      onAnswer: (a) => {
        setPending(null)
        setConversationId(a.conversationId)
        setMessages((m) => [...m, { id: a.messageId, role: 'assistant', content: a.text, status: a.status, evidence: a.evidence }])
        setOverview((o) => {
          if (!o) return o
          const now = new Date().toISOString()
          const exists = o.conversations.some((c) => c.id === a.conversationId)
          const conversations: ConversationSummary[] = exists
            ? o.conversations.map((c) => (c.id === a.conversationId ? { ...c, updatedAt: now } : c))
            : [{ id: a.conversationId, title: question.length > 80 ? `${question.slice(0, 77)}…` : question, updatedAt: now }, ...o.conversations]
          return { ...o, quota: a.quota, conversations }
        })
      },
      onFailure: (message, quota, reason) => {
        setPending(null)
        setNotice(message)
        // The thread was deleted elsewhere: the next question starts a new one.
        if (reason === 'not_found') { setConversationId(null); setMessages((m) => m.filter((x) => !x.id.startsWith('local-'))) }
        if (quota) setOverview((o) => (o ? { ...o, quota } : o))
      },
    })
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-line bg-raised p-6 text-center">
        <p className="text-sm font-medium text-ink">{t.loadFailed}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={retrying} className="mt-4">
          {retrying && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {retrying ? t.loadingRetry : t.retry}
        </Button>
      </div>
    )
  }
  if (!overview) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-accent motion-reduce:animate-none" aria-label={t.loading} />
      </div>
    )
  }

  const blocked = overview.mode === 'none' ? 'unavailable' : overview.quota.limit === 0 ? 'plan' : null
  const outOfQuota = !blocked && overview.quota.remaining <= 0
  const busy = pending !== null

  const history = (
    <nav aria-label={t.historyLabel} className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={fresh} disabled={busy} className="mb-2 w-full justify-start">
        <Plus className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> {t.newQuestion}
      </Button>
      {overview.conversations.length === 0 && <p className="px-1 text-xs leading-relaxed text-quiet">{t.noConversations}</p>}
      {overview.conversations.map((c) => (
        <div key={c.id} className={cn('group flex items-center gap-1 rounded-md', c.id === conversationId ? 'bg-surface' : 'hover:bg-surface/60')}>
          <button
            type="button"
            onClick={() => void open(c.id)}
            disabled={busy}
            aria-current={c.id === conversationId ? 'true' : undefined}
            className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-xs text-ink/85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MessageSquare className={cn('h-3.5 w-3.5 shrink-0', c.id === conversationId ? 'text-accent' : 'text-quiet')} aria-hidden="true" />
            <span className="truncate">{c.title}</span>
          </button>
          {confirmDelete === c.id ? (
            <button
              type="button"
              onClick={() => void remove(c.id)}
              onBlur={() => setConfirmDelete(null)}
              autoFocus
              aria-label={t.confirmDeleteLabel(c.title)}
              className="mr-1 min-h-[32px] rounded-md bg-danger/15 px-2 font-mono text-[11px] text-danger"
            >
              {t.confirmDelete}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(c.id)}
              aria-label={t.deleteLabel(c.title)}
              className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:text-danger md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </nav>
  )

  // Fixed height: <main> scrolls, so the question box stays in view only if
  // the conversation scrolls inside its own area.
  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[28rem] gap-6 md:h-[calc(100dvh-12rem)]">
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-line pr-4 lg:block">{history}</aside>

      <section className="mx-auto flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col">
        {!blocked && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Badge tone={outOfQuota ? 'warning' : 'neutral'} className="tabular-nums">{t.quota(overview.quota.remaining)}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => setDrawer((v) => !v)} aria-expanded={drawer} className="lg:hidden">
              <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" /> {t.conversations}
            </Button>
          </div>
        )}

        {drawer && !blocked && <div className="mb-4 max-h-[40%] overflow-y-auto rounded-lg border border-line bg-raised p-3 lg:hidden">{history}</div>}

        {overview.mode === 'sandbox' && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-ai/30 bg-ai/[0.06] px-3 py-2 text-xs leading-relaxed text-ink/85">
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" aria-hidden="true" />
            {t.sandbox}
          </p>
        )}

        {blocked === 'unavailable' && (
          <div className="rounded-lg border border-line bg-raised p-6">
            <p className="text-sm font-medium text-ink">{t.unavailableTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-quiet">{t.unavailableBody}</p>
          </div>
        )}
        {blocked === 'plan' && (
          <div className="rounded-lg border border-line bg-raised p-6">
            <Lock className="h-5 w-5 text-accent" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-ink">{t.planTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-quiet">{t.planBody}</p>
            <Link href={t.planHref} className={buttonVariants({ size: 'sm', className: 'mt-5' })}>{t.planCta}</Link>
          </div>
        )}

        {!blocked && (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-4 pr-1">
              {opening && (
                <p className="flex items-center gap-2 pt-6 text-xs text-quiet" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" /> {t.opening}
                </p>
              )}
              {messages.length === 0 && !busy && !opening && (
                <div className="pt-6">
                  <p className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{t.startTitle}</p>
                  <p className="mt-1 text-sm text-quiet">{t.startBody}</p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {overview.suggestions.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        disabled={outOfQuota}
                        onClick={() => void send(s.question)}
                        className={cn('min-h-[52px] rounded-lg border bg-raised px-4 py-3 text-left text-sm text-ink transition-colors duration-200 ease-signal disabled:opacity-40', TONE[s.tone])}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm border border-accent/20 bg-accent/10 px-4 py-2.5 text-sm text-ink">{m.content}</p>
                </div>
              ) : (
                <article key={m.id} className="rounded-lg border border-line bg-raised p-4 md:p-5">
                  <AnswerView text={m.content} status={m.status} evidence={m.evidence} />
                </article>
              ))}

              {busy && <ProgressView events={pending ?? []} />}
              {notice && (
                <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs text-ink/85" role="alert">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" /> {notice}
                </p>
              )}
              <div ref={bottom} />
            </div>

            <div className="shrink-0 border-t border-line pt-3">
              {outOfQuota ? (
                <p className="rounded-md border border-warning/30 bg-warning/[0.06] px-4 py-3 text-xs text-ink/85">
                  {t.outOfQuota(new Date(overview.quota.resetsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}
                </p>
              ) : (
                <Composer disabled={busy} campaigns={overview.campaigns} onSend={(q) => void send(q)} initial={initialQuestion} />
              )}
              <p className="mt-1.5 text-center text-[11px] text-quiet">{t.privacy}</p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
