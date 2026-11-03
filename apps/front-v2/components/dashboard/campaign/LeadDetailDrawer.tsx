'use client'

/**
 * The full profile of one lead of the campaign: follow-up (leads.updateStatus),
 * WhatsApp / SMS (LeadPhoneTouch), score and its reason, contact channels,
 * company facts, and a one-off LinkedIn message (leads.sendLinkedinMessage).
 */
import { useState } from 'react'
import {
  Briefcase, Building2, Calendar, Check, CheckCircle, Clock, Copy, Cpu, Database, ExternalLink, Globe, HelpCircle,
  Linkedin, Mail, MapPin, Sparkles, Users, X, XCircle, Zap,
} from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Badge, Button, buttonVariants } from '@/components/ui'
import { Drawer } from '@/components/dashboard/campaign/Drawer'
import { LeadPhoneTouch } from '@/components/dashboard/campaign/LeadPhoneTouch'
import { LEAD_STATUS, SCORE_BADGE, leadDetailCopy as t } from '@/lib/copy/campaign'
import { api } from '@/lib/front/api'
import type { CampaignLeadRow } from '@/lib/front/types-campaigns'
import { BADGE_THRESHOLDS } from '@/lib/leads/badges'
import { cn } from '@/lib/utils'

export type DrawerLead = CampaignLeadRow & { doNotContact?: boolean; phone?: string | null }

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? (err.body?.error ?? fallback) : err instanceof Error ? err.message : fallback)
const statusOf = (status: string) => (status === 'queued' ? LEAD_STATUS.new : LEAD_STATUS[status] ?? LEAD_STATUS.new)
const toHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)
const prettyHost = (url: string) => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')

const SECTION_LABEL = 'font-mono text-xs text-quiet'
const CHANNEL_ROW = 'flex items-center justify-between gap-2 rounded-md border border-line bg-canvas/40 px-3 py-2'
const EDITABLE_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const
const BADGE_ICON: Record<string, typeof Zap> = { FAST_TRACK: Zap, NORMAL: CheckCircle, NURTURE: Clock, SKIP: XCircle, UNSCORED: HelpCircle }

/** The ring takes the lead's priority colour (lib/leads/badges thresholds). */
function ScoreGauge({ score, size = 56 }: { score: number; size?: number }) {
  const tone = score >= BADGE_THRESHOLDS.FAST_TRACK ? 'text-success'
    : score >= BADGE_THRESHOLDS.NORMAL ? 'text-accent'
    : score >= BADGE_THRESHOLDS.NURTURE ? 'text-warning' : 'text-danger'
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={cn('relative flex items-center justify-center', tone)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} className="stroke-surface" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} />
      </svg>
      <span className="absolute font-mono text-[11px] font-bold tabular-nums">{score}</span>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) })
      }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-quiet transition-colors hover:bg-surface hover:text-accent"
      title={t.copy}
      aria-label={copied ? t.copied : t.copyEmail}
    >
      {copied ? <Check className="h-3 w-3 text-success" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  )
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-quiet"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] text-quiet">{label}</div>
        <div className="mt-0.5 text-xs text-ink/90">{children}</div>
      </div>
    </div>
  )
}

function LeadFollowUp({ lead, onLeadUpdated }: { lead: DrawerLead; onLeadUpdated?: (lead: DrawerLead) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = lead.status === 'queued' ? 'new' : lead.status

  const save = async (patch: { status?: (typeof EDITABLE_STATUSES)[number]; doNotContact?: boolean }) => {
    setSaving(true)
    setError(null)
    try {
      const data = await api.call('leads.updateStatus', { params: { leadId: lead.id }, body: patch })
      onLeadUpdated?.({ ...lead, status: data.lead.status, doNotContact: data.lead.doNotContact })
    } catch (err) {
      setError(errorText(err, t.updateFailed))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-5 rounded-lg border border-line p-4">
      <p className={cn('mb-3', SECTION_LABEL)}>{t.followUp}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-quiet">
          {t.status}
          <select
            value={current}
            disabled={saving}
            onChange={(e) => void save({ status: e.target.value as (typeof EDITABLE_STATUSES)[number] })}
            className="h-8 rounded-md border border-line bg-canvas px-2 text-xs text-ink outline-none focus:border-accent/40 disabled:opacity-50 [&_option]:bg-raised"
          >
            {EDITABLE_STATUSES.map((st) => <option key={st} value={st}>{LEAD_STATUS[st]?.label ?? st}</option>)}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-quiet">
          <input type="checkbox" checked={Boolean(lead.doNotContact)} disabled={saving} onChange={(e) => void save({ doNotContact: e.target.checked })} className="h-3.5 w-3.5 accent-[rgb(var(--c-danger))]" />
          {t.doNotContact}
        </label>
      </div>
      {lead.doNotContact && <p className="mt-2 text-[11px] text-danger">{t.doNotContactNote}</p>}
      {error && <p className="mt-2 text-[11px] text-danger" role="alert">{error}</p>}
    </div>
  )
}

function LinkedInComposer({ lead }: { lead: DrawerLead }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sentVia, setSentVia] = useState<'dm' | 'invitation' | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!lead.linkedinUrl) return null

  const send = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const data = await api.call('leads.sendLinkedinMessage', { params: { leadId: lead.id }, body: { message: message.trim() } })
      setSentVia(data.via ?? 'dm')
      setMessage('')
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error ?? t.sendFailed) : t.networkRetry)
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setSentVia(null); setError(null) }} className="mb-2 w-full text-xs">
        <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
        {t.sendLinkedin}
      </Button>
    )
  }
  return (
    <div className="mb-2 rounded-lg border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink"><Linkedin className="h-3 w-3 text-quiet" aria-hidden="true" />{t.linkedinVia}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label={t.closeLinkedin} className="flex h-7 w-7 items-center justify-center rounded-md text-quiet transition-colors hover:bg-surface hover:text-ink">
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={sending} rows={3} maxLength={1500}
        aria-label={t.linkedinFor(lead.firstName)} placeholder={t.linkedinPh(lead.firstName)}
        className="w-full resize-none rounded-md border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-quiet outline-none focus:border-accent/40 disabled:opacity-50" />
      {error && <p className="mt-1.5 text-[11px] text-danger" role="alert">{error}</p>}
      {sentVia && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-success" role="status">
          <Check className="h-3 w-3" aria-hidden="true" />{sentVia === 'dm' ? t.sentDm : t.sentInvite}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[11px] tabular-nums text-quiet">{message.length}/1500</span>
        <Button size="sm" onClick={() => void send()} disabled={sending || !message.trim()} className="h-8 px-4 text-[11px]">{sending ? t.sending : t.send}</Button>
      </div>
    </div>
  )
}

function LeadDetailContent({ lead, onLeadUpdated }: { lead: DrawerLead; onLeadUpdated?: (lead: DrawerLead) => void }) {
  const status = statusOf(lead.status)
  const hasScore = lead.scoreBadge !== 'UNSCORED' && lead.aiScore != null
  const enrich = lead.enrichment
  const badge = SCORE_BADGE[lead.scoreBadge] ?? SCORE_BADGE.UNSCORED
  const BadgeIcon = BADGE_ICON[lead.scoreBadge] ?? HelpCircle
  const EmailIcon = enrich?.emailVerified ? Check : HelpCircle

  return (
    <>
      <div className="mb-4"><Badge tone={status.tone}>{status.label}</Badge></div>
      <LeadFollowUp lead={lead} onLeadUpdated={onLeadUpdated} />
      <LeadPhoneTouch lead={lead} onLeadUpdated={onLeadUpdated} />

      {hasScore && lead.aiScore != null && (
        <div className="mb-5 rounded-lg border border-line p-4">
          <div className="flex items-center gap-4">
            <ScoreGauge score={lead.aiScore} />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge tone={badge.tone} dot={false} className="gap-1"><BadgeIcon className="h-3 w-3" aria-hidden="true" />{badge.label}</Badge>
                <span className="font-mono text-xs font-bold tabular-nums text-ink" title={t.scoreTitle(lead.aiScore)}>{lead.aiScore}/100</span>
              </div>
              {lead.scoreReason && (
                <p className="text-[11px] leading-relaxed text-quiet"><Sparkles className="mr-1 inline h-3 w-3 text-accent" aria-hidden="true" />{lead.scoreReason}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-5">
        <h3 className={cn('mb-1.5', SECTION_LABEL)}>{t.contact}</h3>
        <div className={CHANNEL_ROW}>
          <div className="flex min-w-0 items-center gap-2.5">
            <Mail className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate text-xs text-ink/90">{lead.email}</span>
            {enrich && (
              <span className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold', enrich.emailVerified ? 'text-success' : 'text-warning')}>
                <EmailIcon className="h-3 w-3" aria-hidden="true" />
                {enrich.emailVerified ? t.verified : t.uncertain}
                {enrich.emailConfidence != null && <span className="font-mono tabular-nums">{` ${enrich.emailConfidence} %`}</span>}
              </span>
            )}
          </div>
          <CopyButton value={lead.email} />
        </div>
        {lead.linkedinUrl && (
          <a href={toHref(lead.linkedinUrl)} target="_blank" rel="noopener noreferrer" className={cn('mt-2 transition-colors duration-200 hover:border-accent/30', CHANNEL_ROW)}>
            <span className="flex min-w-0 items-center gap-2.5"><Linkedin className="h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" /><span className="truncate text-xs text-ink/90">{prettyHost(lead.linkedinUrl)}</span></span>
            <ExternalLink className="h-3 w-3 shrink-0 text-quiet" aria-hidden="true" />
          </a>
        )}
        {lead.website && (
          <a href={toHref(lead.website)} target="_blank" rel="noopener noreferrer" className={cn('mt-2 transition-colors duration-200 hover:border-accent/30', CHANNEL_ROW)}>
            <span className="flex min-w-0 items-center gap-2.5"><Globe className="h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" /><span className="truncate text-xs text-ink/90">{prettyHost(lead.website)}</span></span>
            <ExternalLink className="h-3 w-3 shrink-0 text-quiet" aria-hidden="true" />
          </a>
        )}
      </div>

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
          <p className="rounded-lg border border-line p-3 text-[11px] leading-relaxed text-quiet">{enrich.companyDescription}</p>
        </div>
      )}

      {enrich?.technologies && enrich.technologies.length > 0 && (
        <div className="mt-4">
          <h3 className={cn('mb-1.5 flex items-center gap-1.5', SECTION_LABEL)}><Cpu className="h-3 w-3" aria-hidden="true" /> {t.stack}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {enrich.technologies.map((x) => <li key={x} className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-ink/90">{x}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 font-mono text-[11px] text-quiet">
        <span className="inline-flex items-center gap-1.5"><Database className="h-3 w-3" aria-hidden="true" />{t.sources[lead.source] ?? lead.source}</span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          {t.added(new Date(lead.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }))}
        </span>
      </div>
    </>
  )
}

export function LeadDetailDrawer({ lead, onClose, onLeadUpdated }: { lead: DrawerLead | null; onClose: () => void; onLeadUpdated?: (lead: DrawerLead) => void }) {
  const initials = lead ? `${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`.toUpperCase() : ''
  const subtitle = lead ? [lead.enrichment?.headline || lead.title, lead.company].filter(Boolean).join(' · ') || undefined : undefined

  return (
    <Drawer
      open={lead !== null}
      onClose={onClose}
      size="md"
      closeLabel={t.close}
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line font-mono text-sm font-semibold text-accent" aria-hidden="true">{initials}</span>
          <span className="truncate">{lead ? `${lead.firstName} ${lead.lastName}` : ''}</span>
        </span>
      }
      description={subtitle ? <span className="block truncate">{subtitle}</span> : undefined}
      footer={lead ? (
        <div className="w-full">
          <LinkedInComposer lead={lead} />
          <div className="flex items-center gap-2">
            <a href={`mailto:${lead.email}`} className={buttonVariants({ size: 'sm', className: 'h-10 flex-1 text-xs' })}>
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {t.sendEmail}
            </a>
            {lead.linkedinUrl && (
              <a href={toHref(lead.linkedinUrl)} target="_blank" rel="noopener noreferrer" title={t.viewLinkedin} aria-label={t.viewLinkedinNewTab}
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-10 w-10 px-0' })}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      ) : undefined}
    >
      {lead && <LeadDetailContent key={lead.id} lead={lead} onLeadUpdated={onLeadUpdated} />}
    </Drawer>
  )
}
