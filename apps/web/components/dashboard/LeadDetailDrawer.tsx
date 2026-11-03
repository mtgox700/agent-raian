'use client'

/**
 * LeadDetailDrawer: slide-over showing the full enriched profile of a single
 * lead. Opened from the leads table (row click). Surfaces every piece of data
 * we hold today: identity, contact channels (email, LinkedIn, website),
 * company facts (industry, size, country), the AI score with its reasoning,
 * and pipeline metadata (status, source, date added).
 *
 * Built on the dashboard Dialog (drawer variant): the page behind is inert,
 * Escape closes, focus returns to the row that opened it.
 */

import { LeadPhoneTouch } from '@/components/dashboard/LeadPhoneTouch'
import {
  X, Mail, Linkedin, Globe, MapPin, Building2, Users,
  Briefcase, Calendar, Database, ExternalLink, Copy, Check, Sparkles, Cpu, HelpCircle,
} from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge, LEAD_STATUS } from '@/components/ui/status-badge'
import { ScoreGauge } from '@/components/dashboard/ScoreGauge'
import { LeadScoreBadge } from '@/components/dashboard/LeadScoreBadge'
import { cn } from '@/lib/utils'
import type { LeadWithEnrichment, CompanySize } from '@/lib/types/lead'

// ─── Display maps ─────────────────────────────────────────────────────────────

const SIZE_LABELS: Record<CompanySize, string> = {
  XS: '1 à 10 employés',
  S:  '11 à 50 employés',
  M:  '51 à 200 employés',
  L:  '201 à 1000 employés',
  XL: '1000+ employés',
}

const SOURCE_LABELS: Record<string, string> = {
  APOLLO: 'Apollo', CSV_IMPORT: 'Import CSV', MANUAL: 'Manuel',
  AI_PROSPECTING: 'Prospection IA', LINKEDIN: 'LinkedIn',
}

// "queued" is not contacted yet: shown and edited as "Nouveau".
function leadStatus(status: string) {
  if (status === 'queued') return LEAD_STATUS.new!
  return LEAD_STATUS[status] ?? LEAD_STATUS.new!
}

// Normalise a possibly-bare URL into something safe for href.
function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
function prettyHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

const SECTION_LABEL = 'font-mono text-xs text-muted'
const CHANNEL_ROW = 'flex items-center justify-between gap-2 rounded-md border border-border bg-white/[0.02] px-3 py-2'

// ─── Small building blocks ────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        })
      }}
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-cyan"
      title="Copier"
      aria-label={copied ? 'Adresse copiée' : 'Copier l’adresse e-mail'}
    >
      {copied ? <Check className="h-3 w-3 text-success-fg" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  )
}

function InfoRow({
  icon: Icon, label, children,
}: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] text-muted">{label}</div>
        <div className="mt-0.5 text-xs text-white/90">{children}</div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LeadDetailDrawerProps {
  lead: LeadWithEnrichment | null
  onClose: () => void
  /** Called with the lead as saved after a status or opt-out change. */
  onLeadUpdated?: (lead: LeadWithEnrichment) => void
}

export function LeadDetailDrawer({ lead, onClose, onLeadUpdated }: LeadDetailDrawerProps) {
  const initials = lead ? `${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`.toUpperCase() : ''
  const subtitle = lead
    ? [lead.enrichment?.headline || lead.title, lead.company].filter(Boolean).join(' · ') || undefined
    : undefined

  return (
    <Dialog
      open={lead !== null}
      onClose={onClose}
      variant="drawer"
      size="md"
      title={
        <span className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border font-mono text-sm font-semibold text-cyan"
            aria-hidden="true"
          >
            {initials}
          </span>
          <span className="truncate">{lead ? `${lead.firstName} ${lead.lastName}` : ''}</span>
        </span>
      }
      description={subtitle ? <span className="block truncate">{subtitle}</span> : undefined}
      footer={lead ? <LeadDetailActions lead={lead} /> : undefined}
    >
      {lead && <LeadDetailContent lead={lead} onLeadUpdated={onLeadUpdated} />}
    </Dialog>
  )
}

const EDITABLE_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const

/**
 * Status and "ne plus contacter" for one lead. The Leads page had no way to
 * change either (only the hot-leads page could set a status).
 */
function LeadFollowUp({ lead, onLeadUpdated }: { lead: LeadWithEnrichment; onLeadUpdated?: (lead: LeadWithEnrichment) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = lead.status === 'queued' ? 'new' : lead.status

  const save = async (patch: { status?: string; doNotContact?: boolean }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const data = await res.json() as { lead?: { status: string; doNotContact: boolean }; error?: string }
      if (!res.ok || !data.lead) throw new Error(data.error ?? 'Mise à jour impossible')
      onLeadUpdated?.({ ...lead, status: data.lead.status, doNotContact: data.lead.doNotContact })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-5 rounded-[10px] border border-border p-4">
      <p className={cn('mb-3', SECTION_LABEL)}>Suivi</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          Statut
          <select
            value={current}
            disabled={saving}
            onChange={(e) => void save({ status: e.target.value })}
            className="h-8 rounded-md border border-border bg-obsidian px-2 text-xs text-white outline-none focus:border-cyan/40 disabled:opacity-50"
          >
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>{LEAD_STATUS[s]?.label ?? s}</option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={Boolean(lead.doNotContact)}
            disabled={saving}
            onChange={(e) => void save({ doNotContact: e.target.checked })}
            className="h-3.5 w-3.5 accent-danger"
          />
          Ne plus contacter
        </label>
      </div>
      {lead.doNotContact && (
        <p className="mt-2 text-[11px] text-danger">
          Aucune campagne ne lui écrira : désinscription, rebond ou choix manuel.
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-danger" role="alert">{error}</p>}
    </div>
  )
}

function LeadDetailContent({ lead, onLeadUpdated }: {
  lead: LeadWithEnrichment
  onLeadUpdated?: (lead: LeadWithEnrichment) => void
}) {
  const status = leadStatus(lead.status)
  const hasScore = lead.scoreBadge !== 'UNSCORED' && lead.aiScore != null
  const enrich = lead.enrichment
  const EmailIcon = enrich?.emailVerified ? Check : HelpCircle

  return (
    <>
      <div className="mb-4">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <LeadFollowUp lead={lead} onLeadUpdated={onLeadUpdated} />
      <LeadPhoneTouch lead={lead} onLeadUpdated={onLeadUpdated} />

      {/* Score block */}
      {hasScore && (
        <div className="mb-5 rounded-[10px] border border-border p-4">
          <div className="flex items-center gap-4">
            <ScoreGauge score={lead.aiScore!} size={56} />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <LeadScoreBadge badge={lead.scoreBadge} size="md" />
                <span className="font-mono text-xs font-bold tabular-nums text-white">{lead.aiScore}/100</span>
              </div>
              {lead.scoreReason && (
                <p className="text-[11px] leading-relaxed text-muted">
                  <Sparkles className="mr-1 inline h-3 w-3 text-cyan" aria-hidden="true" />
                  {lead.scoreReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact channels: the actionable bit */}
      <div className="mb-5">
        <h3 className={cn('mb-1.5', SECTION_LABEL)}>Contact</h3>

        <div className={CHANNEL_ROW}>
          <div className="flex min-w-0 items-center gap-2.5">
            <Mail className="h-3.5 w-3.5 flex-shrink-0 text-cyan" aria-hidden="true" />
            <span className="truncate text-xs text-white/90">{lead.email}</span>
            {enrich && (
              <span className={cn(
                'inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold',
                enrich.emailVerified ? 'text-success-fg' : 'text-warning',
              )}>
                <EmailIcon className="h-3 w-3" aria-hidden="true" />
                {enrich.emailVerified ? 'Vérifié' : 'Incertain'}
                {enrich.emailConfidence != null && (
                  <span className="font-mono tabular-nums">{` ${enrich.emailConfidence} %`}</span>
                )}
              </span>
            )}
          </div>
          <CopyButton value={lead.email} />
        </div>

        {lead.linkedinUrl && (
          <a
            href={toHref(lead.linkedinUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('mt-2 transition-colors duration-150 hover:border-cyan/30', CHANNEL_ROW)}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Linkedin className="h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate text-xs text-white/90">{prettyHost(lead.linkedinUrl)}</span>
            </div>
            <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted" aria-hidden="true" />
          </a>
        )}

        {lead.website && (
          <a
            href={toHref(lead.website)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('mt-2 transition-colors duration-150 hover:border-cyan/30', CHANNEL_ROW)}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate text-xs text-white/90">{prettyHost(lead.website)}</span>
            </div>
            <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* Firmographics */}
      <div className="divide-y divide-border rounded-[10px] border border-border px-4">
        <InfoRow icon={Building2} label="Entreprise">{lead.company ?? '-'}</InfoRow>
        <InfoRow icon={Briefcase} label="Poste">{lead.title ?? '-'}</InfoRow>
        <InfoRow icon={Database} label="Secteur">{lead.industry ?? '-'}</InfoRow>
        <InfoRow icon={Users} label="Taille">
          {lead.companySize ? SIZE_LABELS[lead.companySize] : '-'}
        </InfoRow>
        <InfoRow icon={MapPin} label="Localisation">
          {[enrich?.city, lead.country].filter(Boolean).join(', ') || '-'}
        </InfoRow>
      </div>

      {/* Company description (enrichment) */}
      {enrich?.companyDescription && (
        <div className="mt-4">
          <h3 className={cn('mb-1.5', SECTION_LABEL)}>À propos de l&apos;entreprise</h3>
          <p className="rounded-[10px] border border-border p-3 text-[11px] leading-relaxed text-muted">
            {enrich.companyDescription}
          </p>
        </div>
      )}

      {/* Tech stack (enrichment, intent signal) */}
      {enrich?.technologies && enrich.technologies.length > 0 && (
        <div className="mt-4">
          <h3 className={cn('mb-1.5 flex items-center gap-1.5', SECTION_LABEL)}>
            <Cpu className="h-3 w-3" aria-hidden="true" /> Stack technique
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {enrich.technologies.map((t) => (
              <li
                key={t}
                className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-white/90"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pipeline meta */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 font-mono text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Database className="h-3 w-3" aria-hidden="true" />
          {SOURCE_LABELS[lead.source] ?? lead.source}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          Ajouté le {new Date(lead.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
    </>
  )
}

// ─── Footer actions ───────────────────────────────────────────────────────────

function LeadDetailActions({ lead }: { lead: LeadWithEnrichment }) {
  return (
    <div className="w-full">
      <LinkedInComposer lead={lead} />
      <div className="flex items-center gap-2">
        <a
          href={`mailto:${lead.email}`}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-cyan text-xs font-semibold text-void transition-colors duration-150 ease-signal hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Envoyer un email
        </a>
        {lead.linkedinUrl && (
          <a
            href={toHref(lead.linkedinUrl)}
            target="_blank"
            rel="noopener noreferrer"
            title="Voir le profil LinkedIn"
            aria-label="Voir le profil LinkedIn (nouvel onglet)"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-white/80 transition-colors duration-150 hover:border-cyan/30 hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── LinkedIn one-off composer ────────────────────────────────────────────────
// Sends a real DM via the workspace's connected Unipile account (falls back to
// a connection invitation server-side if the lead isn't a connection yet).

function LinkedInComposer({ lead }: { lead: LeadWithEnrichment }) {
  const [open,    setOpen]    = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sentVia, setSentVia] = useState<'dm' | 'invitation' | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  if (!lead.linkedinUrl) return null

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/linkedin-message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: message.trim() }),
      })
      const data = (await res.json()) as { ok?: boolean; via?: 'dm' | 'invitation'; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Envoi impossible')
        return
      }
      setSentVia(data.via ?? 'dm')
      setMessage('')
    } catch {
      setError('Erreur réseau : réessayez')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mb-2">
      {!open ? (
        <Button
          variant="outline"
          onClick={() => { setOpen(true); setSentVia(null); setError(null) }}
          className="mb-2 w-full gap-2 text-xs"
        >
          <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
          Envoyer un message LinkedIn
        </Button>
      ) : (
        <div className="mb-2 rounded-[10px] border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white">
              <Linkedin className="h-3 w-3 text-muted" aria-hidden="true" />
              Message LinkedIn : via votre compte connecté
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le message LinkedIn"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
            rows={3}
            maxLength={1500}
            aria-label={`Message LinkedIn pour ${lead.firstName}`}
            placeholder={`Message pour ${lead.firstName}… (si pas encore en relation, il partira en note d'invitation)`}
            className="w-full resize-none rounded-md border border-border bg-obsidian px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-cyan/40 disabled:opacity-50"
          />
          {error && <p className="mt-1.5 text-[11px] text-danger" role="alert">{error}</p>}
          {sentVia && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-success-fg" role="status">
              <Check className="h-3 w-3" aria-hidden="true" />
              {sentVia === 'dm'
                ? 'Message envoyé'
                : 'Invitation de connexion envoyée avec votre message en note'}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-[11px] tabular-nums text-muted">{message.length}/1500</span>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="h-8 px-4 text-[11px]"
            >
              {sending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
