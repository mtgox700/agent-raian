'use client'

/**
 * L'Analyste (E3). One column of conversation, the author's past threads on
 * the side (a drawer on mobile). The answer is shown once verified; while it
 * is prepared, the steps of the work are.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sparkles, MessageSquare, Plus, Trash2, FlaskConical, Lock, AlertTriangle, Loader2, PanelLeft } from 'lucide-react'
import { AnswerView } from './AnswerView'
import { Composer } from './Composer'
import { ProgressView } from './ProgressView'
import { ask } from './stream'
import type { AnalystOverview, ChatMessage, ConversationSummary, ProgressEvent, Quota } from './types'

const TONE: Record<string, string> = {
  bloquant: 'border-warning/30 bg-warning/[0.06] text-white hover:border-warning/50',
  alerte: 'border-cyan/25 bg-cyan/[0.05] text-white hover:border-cyan/45',
  neutre: 'border-border text-white/85 hover:border-white/20',
}

function quotaLabel(q: Quota): string {
  return `${q.remaining} question${q.remaining > 1 ? 's' : ''} restante${q.remaining > 1 ? 's' : ''} ce mois`
}

export function AnalystPageClient({ initialQuestion = '', apiBase = '/api/analyst' }: { initialQuestion?: string; apiBase?: string }) {
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
      const res = await fetch(apiBase)
      // An expired session answers with the sign-in page, not JSON.
      if (res.redirected && new URL(res.url).pathname.startsWith('/sign-in')) { window.location.reload(); return }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as AnalystOverview
      setOverview(data)
      setLoadError(false)
      // The diagnosis-based suggestions take a few seconds: they come after.
      if (data.mode !== 'none' && data.quota.limit > 0) {
        fetch(`${apiBase}/suggestions`)
          .then((r) => (r.ok ? r.json() as Promise<{ suggestions: AnalystOverview['suggestions'] }> : null))
          .then((d) => { if (d?.suggestions?.length) setOverview((o) => (o ? { ...o, suggestions: d.suggestions } : o)) })
          .catch(() => undefined)
      }
    } catch {
      setLoadError(true)
    } finally {
      setRetrying(false)
    }
  }, [apiBase])
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
      const res = await fetch(`${apiBase}/conversations/${id}`)
      if (token !== openToken.current) return
      if (res.status === 404) { setNotice('Cette conversation n’existe plus.'); void load(); return }
      if (!res.ok) throw new Error(String(res.status))
      const { conversation } = await res.json() as { conversation: { id: string; messages: ChatMessage[] } }
      if (token !== openToken.current) return
      setConversationId(conversation.id)
      setMessages(conversation.messages)
    } catch {
      if (token === openToken.current) setNotice('La conversation n’a pas pu s’ouvrir. Réessayez.')
    } finally {
      if (token === openToken.current) setOpening(null)
    }
  }

  const fresh = () => {
    if (pending !== null) return
    openToken.current++
    setOpening(null)
    setConversationId(null); setMessages([]); setNotice(null); setDrawer(false)
  }

  const remove = async (id: string) => {
    setConfirmDelete(null)
    const res = await fetch(`${apiBase}/conversations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res || (!res.ok && res.status !== 404)) { setNotice('La conversation n’a pas pu être supprimée.'); return }
    if (id === conversationId) fresh()
    setOverview((o) => (o ? { ...o, conversations: o.conversations.filter((c) => c.id !== id) } : o))
  }

  const send = async (question: string) => {
    setNotice(null)
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: question }])
    setPending([])
    await ask(question, conversationId, {
      onProgress: (e) => setPending((p) => [...(p ?? []), e]),
      onAnswer: (a) => {
        setPending(null)
        setConversationId(a.conversationId)
        setMessages((m) => [...m, { id: a.messageId, role: 'assistant', content: a.text, status: a.status, evidence: a.evidence }])
        setOverview((o) => {
          if (!o) return o
          const exists = o.conversations.some((c) => c.id === a.conversationId)
          const conversations: ConversationSummary[] = exists
            ? o.conversations.map((c) => (c.id === a.conversationId ? { ...c, updatedAt: new Date().toISOString() } : c))
            : [{ id: a.conversationId, title: question.length > 80 ? `${question.slice(0, 77)}…` : question, updatedAt: new Date().toISOString() }, ...o.conversations]
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
      <div className="mx-auto max-w-lg rounded-[10px] border border-border bg-obsidian p-6 text-center">
        <p className="text-sm font-semibold text-white">L’Analyste n’a pas pu se charger.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={retrying} className="mt-3 gap-2">
          {retrying && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {retrying ? 'Chargement…' : 'Réessayer'}
        </Button>
      </div>
    )
  }
  if (!overview) {
    return <div className="flex h-64 items-center justify-center" role="status"><Loader2 className="h-5 w-5 animate-spin text-cyan" aria-label="Chargement" /></div>
  }

  const blocked = overview.mode === 'none' ? 'unavailable' : overview.quota.limit === 0 ? 'plan' : null
  const outOfQuota = !blocked && overview.quota.remaining <= 0
  const busy = pending !== null

  const history = (
    <nav aria-label="Vos conversations" className="space-y-1">
      <button type="button" onClick={fresh} disabled={busy} className="mb-2 flex min-h-[40px] w-full items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-white transition-colors duration-200 ease-signal hover:border-cyan/40 disabled:cursor-not-allowed disabled:opacity-40">
        <Plus className="h-3.5 w-3.5 text-cyan" aria-hidden="true" /> Nouvelle question
      </button>
      {overview.conversations.length === 0 && <p className="px-1 text-xs text-muted">Vos conversations apparaîtront ici. Elles ne sont visibles que par vous.</p>}
      {overview.conversations.map((c) => (
        <div key={c.id} className={`group flex items-center gap-1 rounded-md ${c.id === conversationId ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}>
          <button type="button" onClick={() => void open(c.id)} disabled={busy} className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-xs text-white/85 disabled:cursor-not-allowed disabled:opacity-40">
            <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">{c.title}</span>
          </button>
          {confirmDelete === c.id ? (
            <button type="button" onClick={() => void remove(c.id)} onBlur={() => setConfirmDelete(null)} autoFocus aria-label={`Confirmer la suppression de « ${c.title} »`} className="mr-1 min-h-[32px] rounded-md bg-danger/15 px-2 text-[11px] font-semibold text-danger">Supprimer</button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(c.id)} aria-label={`Supprimer la conversation « ${c.title} »`} className="mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted opacity-100 hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </nav>
  )

  // Fixed height: the dashboard scrolls <main>, so the question box stays in
  // view only if the conversation scrolls inside its own area.
  return (
    <div className="mx-auto flex h-[calc(100dvh-104px)] max-w-6xl gap-6 md:h-[calc(100dvh-120px)]">
      <aside className="hidden w-60 flex-shrink-0 overflow-y-auto lg:block">{history}</aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan/20 bg-cyan/5">
              <Sparkles className="h-4 w-4 text-cyan" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-[-0.02em] text-white">Analyste</h1>
              <p className="text-xs text-muted">Pourquoi une campagne stagne, pourquoi une autre vend : des réponses prouvées par vos chiffres.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!blocked && <span className="rounded-md border border-border px-3 py-1 font-mono text-xs text-muted tabular-nums">{quotaLabel(overview.quota)}</span>}
            {!blocked && (
              <Button type="button" variant="outline" size="sm" onClick={() => setDrawer((v) => !v)} aria-expanded={drawer} className="gap-1.5 lg:hidden">
                <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" /> Conversations
              </Button>
            )}
          </div>
        </header>

        {drawer && <div className="mb-4 rounded-[10px] border border-border bg-obsidian p-3 lg:hidden">{history}</div>}

        {overview.mode === 'sandbox' && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-cyan/30 bg-cyan/[0.06] px-3 py-2 text-xs text-white/85">
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan" aria-hidden="true" />
            Bac à sable : réponses scriptées à partir des diagnostics, sans modèle d’IA. Le parcours complet (outils, relecture, vérification) est réel.
          </p>
        )}

        {blocked === 'unavailable' && (
          <div className="rounded-[10px] border border-border bg-obsidian p-6">
            <p className="text-sm font-semibold text-white">L’Analyste n’est pas encore activé sur cet environnement.</p>
            <p className="mt-1 text-xs text-muted">Il s’appuie sur un modèle d’IA qui n’est pas configuré ici. Vos diagnostics restent visibles sur chaque campagne.</p>
          </div>
        )}
        {blocked === 'plan' && (
          <div className="rounded-[10px] border border-border bg-obsidian p-6">
            <Lock className="h-5 w-5 text-cyan" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-white">L’Analyste est inclus à partir de la formule Pro.</p>
            <p className="mt-1 text-xs text-muted">Il répond, chiffres à l’appui, à « pourquoi cette campagne n’avance pas » et « que changer cette semaine ».</p>
            <Link href="/dashboard/settings?tab=billing" className={buttonVariants({ size: 'sm', className: 'mt-4' })}>Voir les formules</Link>
          </div>
        )}

        {!blocked && (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-4 pr-1">
              {opening && (
                <p className="flex items-center gap-2 pt-6 text-xs text-muted" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan" aria-hidden="true" /> Ouverture de la conversation…
                </p>
              )}
              {messages.length === 0 && !busy && !opening && (
                <div className="pt-6">
                  <p className="text-sm font-semibold text-white">Par où commencer ?</p>
                  <p className="mt-1 text-xs text-muted">Suggestions tirées de l’état actuel de vos campagnes.</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {overview.suggestions.map((s) => (
                      <button key={s.label} type="button" disabled={outOfQuota} onClick={() => void send(s.question)} className={`min-h-[52px] rounded-md border px-4 py-3 text-left text-sm transition-colors duration-200 ease-signal disabled:opacity-40 ${TONE[s.tone]}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] rounded-br-sm bg-cyan/[0.12] px-4 py-2.5 text-sm text-white">{m.content}</p>
                </div>
              ) : (
                <article key={m.id} className="rounded-[10px] border border-border bg-obsidian p-4 md:p-5">
                  <AnswerView text={m.content} status={m.status} evidence={m.evidence} />
                </article>
              ))}

              {busy && <ProgressView events={pending ?? []} />}
              {notice && (
                <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs text-white/85" role="alert">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" aria-hidden="true" /> {notice}
                </p>
              )}
              <div ref={bottom} />
            </div>

            <div className="flex-shrink-0 border-t border-border pt-3">
              {outOfQuota ? (
                <p className="rounded-md border border-warning/30 bg-warning/[0.06] px-4 py-3 text-xs text-white/85">
                  Le quota de questions de ce mois est atteint. Il se renouvelle le {new Date(overview.quota.resetsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.
                </p>
              ) : (
                <Composer disabled={busy} campaigns={overview.campaigns} onSend={(q) => void send(q)} initial={initialQuestion} />
              )}
              <p className="mt-1.5 text-center text-[11px] text-muted">L’Analyste lit vos statistiques agrégées, jamais les adresses ni les réponses de vos prospects.</p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
