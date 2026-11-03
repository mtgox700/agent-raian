'use client'

/**
 * One reply, read in full: who answered, how the AI classed it, the message,
 * and the action that matches its channel: a quoted e-mail reply (mailto) or
 * a LinkedIn message (leads.sendLinkedinMessage). Same markup on the desktop
 * pane and in the phone drawer.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Building2, Check, ExternalLink, Linkedin, Mail, X } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Badge, Button, buttonVariants } from '@/components/ui'
import { CLASSIF, replyCopy as t } from '@/lib/copy/inbox'
import { api } from '@/lib/front/api'
import type { InboxReplyRow } from '@/lib/front/types-inbox'
import { cn } from '@/lib/utils'

/** LinkedIn replies are stored with fromEmail = `linkedin:<provider_id>`. */
const isLinkedInReply = (reply: InboxReplyRow) => reply.fromEmail.startsWith('linkedin:')

function buildMailto(reply: InboxReplyRow): string {
  const original = reply.emailSend?.subject ?? ''
  const subject = original ? (/^re\s*:/i.test(original) ? original : `Re: ${original}`) : t.mailSubjectDefault
  // Mail clients cut long mailto links: quote at most ~1 500 characters.
  const quoted = reply.bodySnippet.slice(0, 1500).split('\n').map((l) => `> ${l}`).join('\n')
  const when = new Date(reply.receivedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  const body = `\n\n---\n${t.wrote(when, reply.lead.firstName)}\n\n${quoted}\n`
  return `mailto:${reply.lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function LinkedInReplyBox({ leadId, firstName }: { leadId: string; firstName: string }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      await api.call('leads.sendLinkedinMessage', { params: { leadId }, body: { message: message.trim() } })
      setSent(true)
      setMessage('')
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error ?? t.sendFailed) : t.network)
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" className="mb-2 w-full" onClick={() => { setOpen(true); setSent(false); setError(null) }}>
        <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
        {t.replyLinkedin}
      </Button>
    )
  }
  const id = `linkedin-reply-${leadId}`
  return (
    <div className="mb-2 rounded-md border border-line bg-canvas p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink"><Linkedin className="h-3 w-3 text-quiet" aria-hidden="true" />{t.linkedinVia}</span>
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={() => setOpen(false)} aria-label={t.closeLinkedin}><X className="h-3.5 w-3.5" aria-hidden="true" /></Button>
      </div>
      <label htmlFor={id} className="sr-only">{t.yourReply(firstName)}</label>
      <textarea id={id} value={message} onChange={(e) => setMessage(e.target.value)} disabled={sending} rows={3} maxLength={1500} placeholder={t.yourReplyPh(firstName)}
        className="w-full resize-none rounded-md border border-line bg-raised px-3 py-2 text-xs text-ink outline-none placeholder:text-quiet focus:border-accent/60 disabled:opacity-50" />
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
      {sent && <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-success"><Check className="h-3.5 w-3.5" aria-hidden="true" />{t.sent}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className={cn('font-mono text-xs tabular-nums', message.length >= 1500 ? 'text-warning' : 'text-quiet')}>{message.length}/1500</span>
        <Button size="sm" onClick={() => void send()} disabled={sending || !message.trim()}>{sending ? t.sending : t.send}</Button>
      </div>
    </div>
  )
}

export function ReplyDetail({ reply, onClose, isMobile }: {
  reply: InboxReplyRow
  onClose: () => void
  /** In the phone drawer: the drawer carries the name and the close button. */
  isMobile?: boolean
}) {
  const c = CLASSIF[reply.classification] ?? CLASSIF.NEUTRAL
  const linkedIn = isLinkedInReply(reply)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            {!isMobile && <span className="truncate font-semibold text-ink">{reply.lead.firstName} {reply.lead.lastName}</span>}
            <Badge tone={c.tone}>{c.label}<span className="tabular-nums text-quiet">{reply.confidence} %</span></Badge>
          </div>
          {linkedIn
            ? <p className="flex items-center gap-1 text-xs text-quiet"><Linkedin className="h-3 w-3" aria-hidden="true" />{t.linkedinReply}</p>
            : <p className="truncate text-xs text-quiet">{reply.fromEmail}</p>}
        </div>
        {!isMobile && (
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={onClose} aria-label={t.close}><X className="h-4 w-4" aria-hidden="true" /></Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas px-5 py-3">
        {reply.lead.company && <span className="flex items-center gap-1.5 text-xs text-quiet"><Building2 className="h-3 w-3" aria-hidden="true" />{reply.lead.company}</span>}
        {reply.lead.title && <span className="text-xs text-quiet">{reply.lead.title}</span>}
        {reply.lead.aiScore !== null && (
          <span className="ml-auto font-mono text-xs text-quiet">{t.aiScore} <span className="font-semibold tabular-nums text-accent">{reply.lead.aiScore}</span></span>
        )}
      </div>

      {reply.emailSend?.subject && (
        <div className="border-b border-line px-5 py-2">
          <p className="font-mono text-xs text-quiet">{t.inReplyTo}</p>
          <p className="mt-0.5 truncate text-xs text-ink/80">{reply.emailSend.subject}</p>
        </div>
      )}

      <div className={isMobile ? 'flex-1 px-5 py-5' : 'flex-1 overflow-y-auto px-5 py-5'}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">{reply.bodySnippet}</p>
      </div>

      <div className="border-t border-line px-5 py-3">
        {linkedIn && <LinkedInReplyBox leadId={reply.lead.id} firstName={reply.lead.firstName} />}
        <div className="flex flex-wrap items-center gap-2">
          <a href={buildMailto(reply)} className={buttonVariants({ variant: linkedIn ? 'outline' : 'primary', size: 'sm' })}>
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {t.replyEmail}
          </a>
          <Link href={`/dashboard/campaigns/${reply.campaign.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t.seeCampaign}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
          <span className="ml-auto font-mono text-xs text-quiet">{t.campaign(reply.campaign.name)}</span>
        </div>
      </div>
    </div>
  )
}
