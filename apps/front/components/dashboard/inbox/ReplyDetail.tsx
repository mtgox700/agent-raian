'use client'

/**
 * One reply, read in full: who answered, how the AI classed it, the message,
 * and the action that matches its channel (e-mail or LinkedIn).
 * Split out of InboxPageClient; same markup on the desktop pane and inside
 * the mobile drawer.
 */

import { useState } from 'react'
import { Building2, Check, ExternalLink, Linkedin, Mail, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics/events'
import type { ReplyClassification } from '@/lib/repositories/replies.repository'

export interface ReplyRow {
  id:             string
  receivedAt:     string
  fromEmail:      string
  bodySnippet:    string
  bodyText?:      string
  classification: ReplyClassification
  confidence:     number
  isRead:         boolean
  lead: {
    id:        string
    firstName: string
    lastName:  string
    email:     string
    company:   string | null
    title:     string | null
    aiScore:   number | null
  }
  campaign: { id: string; name: string }
  emailSend: { id: string; subject: string | null } | null
}

// A person said yes: gold. A person said no: danger. Everything else: neutral.
export const CLASSIF: Record<ReplyClassification, { label: string; tone: StatusTone; dot: string }> = {
  POSITIVE:        { label: 'Positive',      tone: 'human',   dot: 'bg-gold' },
  MEETING_REQUEST: { label: 'Rendez-vous',   tone: 'human',   dot: 'bg-gold' },
  NEGATIVE:        { label: 'Négative',      tone: 'danger',  dot: 'bg-danger' },
  NOT_INTERESTED:  { label: 'Pas intéressé', tone: 'neutral', dot: 'bg-muted' },
  NEUTRAL:         { label: 'Neutre',        tone: 'neutral', dot: 'bg-muted' },
}

/** LinkedIn replies are stored with fromEmail = `linkedin:<provider_id>`. */
export function isLinkedInReply(reply: ReplyRow): boolean {
  return reply.fromEmail.startsWith('linkedin:')
}

function buildGmailMailto(reply: ReplyRow): string {
  const original = reply.emailSend?.subject ?? ''
  const subject  = original ? (/^re\s*:/i.test(original) ? original : `Re: ${original}`) : 'Re: votre réponse'
  // Mail clients cut long mailto links: quote at most ~1 500 characters.
  const quoted   = (reply.bodyText ?? reply.bodySnippet).slice(0, 1500).split('\n').map((l) => `> ${l}`).join('\n')
  const when     = new Date(reply.receivedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  const body     = `\n\n---\nLe ${when}, ${reply.lead.firstName} a écrit :\n\n${quoted}\n`
  return `mailto:${reply.lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function ReplyDetail({
  reply,
  onClose,
  isMobile,
}: {
  reply:    ReplyRow
  onClose:  () => void
  /** Inside the mobile drawer: the drawer carries the name and the close button. */
  isMobile?: boolean
}) {
  const c        = CLASSIF[reply.classification]
  const mailto   = buildGmailMailto(reply)
  const linkedIn = isLinkedInReply(reply)

  return (
    <div className="flex h-full flex-col">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            {!isMobile && (
              <span className="truncate font-semibold text-white">
                {reply.lead.firstName} {reply.lead.lastName}
              </span>
            )}
            <StatusBadge tone={c.tone}>
              {c.label}
              <span className="tabular-nums text-muted">{reply.confidence} %</span>
            </StatusBadge>
          </div>
          {linkedIn ? (
            <p className="flex items-center gap-1 text-xs text-muted">
              <Linkedin className="h-3 w-3" aria-hidden="true" />
              Réponse LinkedIn
            </p>
          ) : (
            <p className="truncate text-xs text-muted">{reply.fromEmail}</p>
          )}
        </div>

        {!isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted" onClick={onClose} aria-label="Fermer la réponse">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Lead context */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-void px-5 py-3">
        {reply.lead.company && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Building2 className="h-3 w-3" aria-hidden="true" />
            {reply.lead.company}
          </span>
        )}
        {reply.lead.title && (
          <span className="text-xs text-muted">{reply.lead.title}</span>
        )}
        {reply.lead.aiScore !== null && (
          <span className="ml-auto font-mono text-xs text-muted">
            Score IA <span className="font-semibold tabular-nums text-cyan">{reply.lead.aiScore}</span>
          </span>
        )}
      </div>

      {/* Original subject */}
      {reply.emailSend?.subject && (
        <div className="border-b border-border px-5 py-2">
          <p className="font-mono text-xs text-muted">En réponse à</p>
          <p className="mt-0.5 truncate text-xs text-white/80">{reply.emailSend.subject}</p>
        </div>
      )}

      {/* Body */}
      {/* Inside the mobile drawer the Dialog body already scrolls: one scroll area, not two. */}
      <div className={isMobile ? 'flex-1 px-5 py-5' : 'flex-1 overflow-y-auto px-5 py-5'}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
          {reply.bodyText ?? reply.bodySnippet}
        </p>
      </div>

      {/* Actions: the primary action matches the reply's channel */}
      <div className="border-t border-border px-5 py-3">
        {linkedIn && <LinkedInReplyBox leadId={reply.lead.id} firstName={reply.lead.firstName} />}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={mailto}
            onClick={() => track('inbox_reply_responded', { classification: reply.classification })}
            className={buttonVariants({ variant: linkedIn ? 'outline' : 'default', size: 'sm' })}
          >
            <Mail className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Répondre par e-mail
          </a>
          <a
            href={`/dashboard/campaigns/${reply.campaign.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Voir la campagne
            <ExternalLink className="ml-2 h-3 w-3" aria-hidden="true" />
          </a>
          <span className="ml-auto font-mono text-xs text-muted">
            Campagne : {reply.campaign.name}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── LinkedIn reply composer: sends via the connected Unipile account ────────

function LinkedInReplyBox({ leadId, firstName }: { leadId: string; firstName: string }) {
  const [open,    setOpen]    = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/linkedin-message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: message.trim() }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) { setError(data.error ?? 'Envoi impossible'); return }
      setSent(true)
      setMessage('')
      track('inbox_reply_responded', { classification: 'linkedin_dm' })
    } catch {
      setError('Erreur réseau : réessayez')
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        className="mb-2 w-full"
        onClick={() => { setOpen(true); setSent(false); setError(null) }}
      >
        <Linkedin className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        Répondre via LinkedIn
      </Button>
    )
  }

  return (
    <div className="mb-2 rounded-md border border-border bg-void p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
          <Linkedin className="h-3 w-3 text-muted" aria-hidden="true" />
          Réponse LinkedIn : via votre compte connecté
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted"
          onClick={() => setOpen(false)}
          aria-label="Fermer la réponse LinkedIn"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      <label htmlFor={`linkedin-reply-${leadId}`} className="sr-only">Votre réponse à {firstName}</label>
      <textarea
        id={`linkedin-reply-${leadId}`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={sending}
        rows={3}
        maxLength={1500}
        placeholder={`Votre réponse à ${firstName}…`}
        className="w-full resize-none rounded-md border border-border bg-obsidian px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-cyan/60 disabled:opacity-50"
      />
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
      {sent && (
        <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-success-fg">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Message envoyé dans la conversation LinkedIn
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className={cn('font-mono text-xs tabular-nums', message.length >= 1500 ? 'text-warning' : 'text-muted')}>
          {message.length}/1500
        </span>
        <Button size="sm" onClick={handleSend} disabled={sending || !message.trim()}>
          {sending ? 'Envoi…' : 'Envoyer'}
        </Button>
      </div>
    </div>
  )
}
