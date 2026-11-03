'use client'

/**
 * The full profile of one lead, in a side panel opened from the table:
 * follow-up (status, do-not-contact), WhatsApp & SMS, the AI score with its
 * reasoning, contact channels, company facts and pipeline metadata, and the
 * LinkedIn one-off message. Same data and endpoints as body n°1.
 */

import { useState } from 'react'
import {
  Briefcase, Building2, Calendar, Check, Copy, Cpu, Database, ExternalLink, Globe,
  HelpCircle, Linkedin, Mail, MapPin, Sparkles, Users, X,
} from 'lucide-react'
import { Badge, Button, Select, Textarea, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { LEAD_STATUS, detailCopy as t, leadStatus } from '@/lib/copy/leads'
import type { LeadRow } from '@/lib/front/types-leads'
import { LeadPhoneTouch } from './LeadPhoneTouch'
import { LeadScoreBadge } from './LeadScoreBadge'
import { ScoreGauge } from './ScoreGauge'
import { Sheet } from './Sheet'
import { apiErrorMessage } from './errors'

/** Normalise a possibly-bare URL into something safe for href. */
export function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
function prettyHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

const SECTION_LABEL = 'font-mono text-xs text-quiet'
const CHANNEL_ROW = 'flex items-center justify-between gap-2 rounded-md border border-line bg-canvas px-3 py-2'

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        })
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-accent"
      title={t.copy}
      aria-label={copied ? t.copied : t.copyEmail}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  )
}

function InfoRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-quiet">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-quiet">{label}</p>
        <p className="mt-0.5 text-sm text-ink">{children}</p>
      </div>
    </div>
  )
}

export function LeadDetailDrawer({ lead, onClose, onLeadUpdated }: {
  lead: LeadRow | null
  onClose: () => void
  /** Called with the lead as saved after a status, opt-out or phone change. */
  onLeadUpdated?: (lead: LeadRow) => void
}) {
  const initials = lead ? `${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`.toUpperCase() : ''
  const subtitle = lead
    ? [lead.enrichment?.headline || lead.title, lead.company].filter(Boolean).join(' · ') || undefined
    : undefined

  return (
    <Sheet
      open={lead !== null}
      onClose={onClose}
      closeLabel={t.close}
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line font-mono text-sm font-semibold text-accent" aria-hidden="true">
            {initials}
          </span>
          <span className="truncate">{lead ? `${lead.firstName} ${lead.lastName}` : ''}</span>
        </span>
      }
      description={subtitle ? <span className="block truncate">{subtitle}</span> : undefined}
      footer={lead ? <LeadDetailActions key={lead.id} lead={lead} /> : undefined}
    >
      {lead && <LeadDetailContent key={lead.id} lead={lead} onLeadUpdated={onLeadUpdated} />}
    </Sheet>
  )
}

const EDITABLE_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const
type EditableStatus = (typeof EDITABLE_STATUSES)[number]

/** Status and "ne plus contacter" for one lead (PATCH leads.updateStatus). */
function LeadFollowUp({ lead, onLeadUpdated }: { lead: LeadRow; onLeadUpdated?: (lead: LeadRow) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = lead.status === 'queued' ? 'new' : lead.status
  const statusId = `lead-status-${lead.id}`
  const dncId = `lead-dnc-${lead.id}`

  const save = async (patch: { status?: EditableStatus; doNotContact?: boolean }) => {
    setSaving(true)
    setError(null)
    try {
      const data = await api.call('leads.updateStatus', { params: { leadId: lead.id }, body: patch })
      onLeadUpdated?.({ ...lead, status: data.lead.status, doNotContact: data.lead.doNotContact })
    } catch (err) {
      setError(apiErrorMessage(err, t.updateFailed))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-5 rounded-lg border border-line p-4" aria-labelledby={`follow-${lead.id}`}>
      <h3 id={`follow-${lead.id}`} className={cn('mb-3', SECTION_LABEL)}>{t.followUp}</h3>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={statusId} className="text-sm text-quiet">{t.status}</label>
          <Select
            id={statusId}
            size="sm"
            value={current}
            disabled={saving}
            onChange={(e) => void save({ status: e.target.value as EditableStatus })}
            wrapperClassName="w-40"
          >
            {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS[s]?.label ?? s}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id={dncId}
            type="checkbox"
            checked={Boolean(lead.doNotContact)}
            disabled={saving}
            onChange={(e) => void save({ doNotContact: e.target.checked })}
            className="h-4 w-4 accent-danger"
          />
          <label htmlFor={dncId} className="cursor-pointer text-sm text-quiet">{t.doNotContact}</label>
        </div>
      </div>
      {lead.doNotContact && <p className="mt-2 text-xs text-danger">{t.doNotContactNote}</p>}
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
    </section>
  )
}

function LeadDetailContent({ lead, onLeadUpdated }: { lead: LeadRow; onLeadUpdated?: (lead: LeadRow) => void }) {
  const status = leadStatus(lead.status)
  const hasScore = lead.scoreBadge !== 'UNSCORED' && lead.aiScore != null
  const enrich = lead.enrichment
  const EmailIcon = enrich?.emailVerified ? Check : HelpCircle

  return (
    <>
      <div className="mb-4">
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <LeadFollowUp lead={lead} onLeadUpdated={onLeadUpdated} />
      <LeadPhoneTouch lead={lead} onLeadUpdated={onLeadUpdated} />

      {hasScore && (
        <div className="mb-5 rounded-lg border border-line p-4">
          <div className="flex items-center gap-4">
            <ScoreGauge score={lead.aiScore!} size={56} />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <LeadScoreBadge badge={lead.scoreBadge} />
                <span className="font-mono text-xs font-semibold tabular-nums text-ink">{t.outOf100(lead.aiScore!)}</span>
              </div>
              {lead.scoreReason && (
                <p className="text-xs leading-relaxed text-quiet">
                  <Sparkles className="mr-1 inline h-3 w-3 text-ai" aria-hidden="true" />
                  {lead.scoreReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <section className="mb-5" aria-labelledby={`contact-${lead.id}`}>
        <h3 id={`contact-${lead.id}`} className={cn('mb-1.5', SECTION_LABEL)}>{t.contact}</h3>

        <div className={CHANNEL_ROW}>
          <div className="flex min-w-0 items-center gap-2.5">
            <Mail className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate text-sm text-ink">{lead.email}</span>
            {enrich && (
              <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-medium', enrich.emailVerified ? 'text-success' : 'text-warning')}>
                <EmailIcon className="h-3 w-3" aria-hidden="true" />
                {enrich.emailVerified ? t.verified : t.uncertain}
                {enrich.emailConfidence != null && <span className="font-mono tabular-nums">{t.percent(enrich.emailConfidence)}</span>}
              </span>
            )}
          </div>
          <CopyButton value={lead.email} />
        </div>

        {lead.linkedinUrl && (
          <a href={toHref(lead.linkedinUrl)} target="_blank" rel="noopener noreferrer" className={cn('mt-2 transition-colors duration-200 ease-signal hover:border-accent', CHANNEL_ROW)}>
            <span className="flex min-w-0 items-center gap-2.5">
              <Linkedin className="h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
              <span className="truncate text-sm text-ink">{prettyHost(lead.linkedinUrl)}</span>
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-quiet" aria-hidden="true" />
          </a>
        )}

        {lead.website && (
          <a href={toHref(lead.website)} target="_blank" rel="noopener noreferrer" className={cn('mt-2 transition-colors duration-200 ease-signal hover:border-accent', CHANNEL_ROW)}>
            <span className="flex min-w-0 items-center gap-2.5">
              <Globe className="h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
              <span className="truncate text-sm text-ink">{prettyHost(lead.website)}</span>
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-quiet" aria-hidden="true" />
          </a>
        )}
      </section>

      <div className="divide-y divide-line rounded-lg border border-line px-4">
        <InfoRow icon={Building2} label={t.company}>{lead.company ?? '-'}</InfoRow>
        <InfoRow icon={Briefcase} label={t.title}>{lead.title ?? '-'}</InfoRow>
        <InfoRow icon={Database} label={t.industry}>{lead.industry ?? '-'}</InfoRow>
        <InfoRow icon={Users} label={t.size}>{lead.companySize ? t.sizes[lead.companySize] : '-'}</InfoRow>
        <InfoRow icon={MapPin} label={t.location}>{[enrich?.city, lead.country].filter(Boolean).join(', ') || '-'}</InfoRow>
      </div>

      {enrich?.companyDescription && (
        <div className="mt-4">
          <h3 className={cn('mb-1.5', SECTION_LABEL)}>{t.about}</h3>
          <p className="rounded-lg border border-line p-3 text-xs leading-relaxed text-quiet">{enrich.companyDescription}</p>
        </div>
      )}

      {enrich?.technologies && enrich.technologies.length > 0 && (
        <div className="mt-4">
          <h3 className={cn('mb-1.5 flex items-center gap-1.5', SECTION_LABEL)}>
            <Cpu className="h-3 w-3" aria-hidden="true" /> {t.stack}
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {enrich.technologies.map((tech) => (
              <li key={tech} className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-ink">{tech}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 font-mono text-[11px] text-quiet">
        <span className="inline-flex items-center gap-1.5">
          <Database className="h-3 w-3" aria-hidden="true" />
          {t.sources[lead.source] ?? lead.source}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          {t.added(new Date(lead.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }))}
        </span>
      </div>
    </>
  )
}

function LeadDetailActions({ lead }: { lead: LeadRow }) {
  return (
    <div className="w-full">
      <LinkedInComposer lead={lead} />
      <div className="flex items-center gap-2">
        <a href={`mailto:${lead.email}`} className={cn(buttonVariants({ size: 'md' }), 'flex-1')}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          {t.sendEmail}
        </a>
        {lead.linkedinUrl && (
          <a
            href={toHref(lead.linkedinUrl)}
            target="_blank"
            rel="noopener noreferrer"
            title={t.viewLinkedin}
            aria-label={t.viewLinkedinLabel}
            className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'w-11 px-0')}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Sends a real DM through the workspace's connected LinkedIn account (the
 * server falls back to a connection invitation when the lead is not a
 * connection yet).
 */
function LinkedInComposer({ lead }: { lead: LeadRow }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sentVia, setSentVia] = useState<'dm' | 'invitation' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const l = t.linkedin

  if (!lead.linkedinUrl) return null

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const data = await api.call('leads.sendLinkedinMessage', { params: { leadId: lead.id }, body: { message: message.trim() } })
      setSentVia(data.via ?? 'dm')
      setMessage('')
    } catch (err) {
      setError(err instanceof TypeError ? l.network : apiErrorMessage(err, l.failed))
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setSentVia(null); setError(null) }} className="mb-2 w-full">
        <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
        {l.open}
      </Button>
    )
  }

  return (
    <div className="mb-2 rounded-lg border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
          <Linkedin className="h-3 w-3 text-quiet" aria-hidden="true" />
          {l.heading}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={l.close}
          className="flex h-7 w-7 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={sending}
        rows={3}
        maxLength={1500}
        aria-label={l.label(lead.firstName)}
        placeholder={l.placeholder(lead.firstName)}
        className="min-h-0 resize-none text-sm"
      />
      {error && <p className="mt-1.5 text-xs text-danger" role="alert">{error}</p>}
      {sentVia && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-success" role="status">
          <Check className="h-3 w-3" aria-hidden="true" />
          {sentVia === 'dm' ? l.sentDm : l.sentInvitation}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[11px] tabular-nums text-quiet">{l.count(message.length)}</span>
        <Button size="sm" onClick={handleSend} disabled={sending || !message.trim()}>
          {sending ? l.sending : l.send}
        </Button>
      </div>
    </div>
  )
}
