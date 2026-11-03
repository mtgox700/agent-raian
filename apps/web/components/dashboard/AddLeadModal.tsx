'use client'

import { useState } from 'react'
import { UserPlus, Loader2, CheckCircle, AlertCircle, Check } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { LeadWithEnrichment } from '@/lib/types/lead'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignOption {
  id: string
  name: string
  status: string
}

interface AddLeadModalProps {
  open: boolean
  workspaceId: string
  campaigns: CampaignOption[]
  onClose: () => void
  onLeadAdded: (lead: LeadWithEnrichment) => void
}

type ScoreBadge = 'FAST_TRACK' | 'NORMAL' | 'NURTURE'

const SCORE_BADGES: { value: ScoreBadge; label: string; desc: string; on: string }[] = [
  // A manual lead has no score (the API stores aiScore null): the user picks
  // a priority, and the screen says what it does, not a number it would invent.
  // Tones as on LeadScoreBadge.
  { value: 'FAST_TRACK', label: 'Fast Track', desc: 'contacté en premier',          on: 'border-success-fg/30 bg-success-fg/10 text-success-fg' },
  { value: 'NORMAL',     label: 'Normal',     desc: 'contacté par la campagne',     on: 'border-cyan/30 bg-cyan/10 text-cyan' },
  { value: 'NURTURE',    label: 'Nurture',    desc: 'gardé de côté, pas contacté',  on: 'border-warning/30 bg-warning/10 text-warning' },
]

const FIELD_LABEL = 'mb-1.5 block font-mono text-xs text-muted'
const INPUT = 'h-9 w-full rounded-md border border-border bg-white/[0.03] px-3 text-xs text-white placeholder:text-muted/70 outline-none transition-colors focus:border-cyan/40'
const FORM_ID = 'add-lead-form'

// What happens next, said for this lead: a Nurture lead is never contacted,
// and only a campaign that runs sends (lib/sequences/queue-first-step.ts).
function successMessage(campaignId: string, badge: ScoreBadge, campaigns: CampaignOption[]): string {
  if (!campaignId) return 'Lead ajouté à votre base. Associez-le à une campagne pour qu’il soit contacté.'
  if (badge === 'NURTURE') return 'Le lead est lié à votre campagne, en Nurture : il ne sera pas contacté.'
  const active = campaigns.find((c) => c.id === campaignId)?.status === 'active'
  return active
    ? 'Le lead est lié à votre campagne en cours : son premier message partira avec la séquence.'
    : 'Le lead est lié à votre campagne. Lancez-la pour qu’il soit contacté.'
}

// ─── Component ────────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  active: 'active',
  paused: 'en pause',
  draft:  'brouillon',
}

export function AddLeadModal({ open, workspaceId, campaigns, onClose, onLeadAdded }: AddLeadModalProps) {
  const [form, setForm] = useState({
    firstName: '',
    lastName:  '',
    email:     '',
    company:   '',
    title:     '',
    industry:  '',
    linkedinUrl: '',
    website:   '',
    campaignId: '',
    scoreBadge: 'FAST_TRACK' as ScoreBadge,
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const isValid = form.firstName.trim() && form.lastName.trim() && form.email.trim()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || status === 'loading') return

    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/leads/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          firstName:  form.firstName.trim(),
          lastName:   form.lastName.trim(),
          email:      form.email.trim(),
          company:    form.company.trim()  || undefined,
          title:      form.title.trim()    || undefined,
          industry:   form.industry.trim() || undefined,
          linkedinUrl: form.linkedinUrl.trim() || undefined,
          website:    form.website.trim()  || undefined,
          campaignId: form.campaignId      || undefined,
          scoreBadge: form.scoreBadge,
        }),
      })

      const data = await res.json() as { success?: boolean; data?: LeadWithEnrichment; error?: string }

      if (!res.ok || !data.success || !data.data) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Erreur inconnue')
        return
      }

      setStatus('success')
      onLeadAdded(data.data)

      // Auto-close after 1.2s
      setTimeout(() => {
        onClose()
        setStatus('idle')
        setForm({ firstName: '', lastName: '', email: '', company: '', title: '', industry: '', linkedinUrl: '', website: '', campaignId: '', scoreBadge: 'FAST_TRACK' })
      }, 1200)
    } catch {
      setStatus('error')
      setErrorMsg('Erreur réseau : vérifiez votre connexion')
    }
  }

  const footer = status === 'success' ? undefined : (
    <Button type="submit" form={FORM_ID} disabled={!isValid || status === 'loading'} className="w-full gap-2">
      {status === 'loading' ? (
        <>
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          Ajout en cours...
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Ajouter le lead
        </>
      )}
    </Button>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={status === 'loading'}
      title="Ajouter un lead"
      description="Un contact que vous connaissez déjà"
      footer={footer}
    >
      {/* Success state */}
      {status === 'success' && (
        <div className="flex flex-col items-center gap-3 px-2 py-6 text-center" role="status">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-success-fg/30">
            <CheckCircle className="h-6 w-6 text-success-fg" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-white">Lead ajouté</p>
          <p className="text-xs text-muted">
            {successMessage(form.campaignId, form.scoreBadge, campaigns)}
          </p>
        </div>
      )}

      {/* Form */}
      {status !== 'success' && (
        <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-lead-first" className={FIELD_LABEL}>
                Prénom <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input id="add-lead-first" value={form.firstName} onChange={update('firstName')} placeholder="Camille" required autoComplete="off" className={INPUT} />
            </div>
            <div>
              <label htmlFor="add-lead-last" className={FIELD_LABEL}>
                Nom <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input id="add-lead-last" value={form.lastName} onChange={update('lastName')} placeholder="Martin" required autoComplete="off" className={INPUT} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="add-lead-email" className={FIELD_LABEL}>
              E-mail <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              id="add-lead-email"
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="camille.martin@entreprise.fr"
              required
              autoComplete="off"
              className={INPUT}
            />
          </div>

          {/* Company + Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-lead-company" className={FIELD_LABEL}>Entreprise</label>
              <input id="add-lead-company" value={form.company} onChange={update('company')} placeholder="Entreprise" className={INPUT} />
            </div>
            <div>
              <label htmlFor="add-lead-title" className={FIELD_LABEL}>Poste</label>
              <input id="add-lead-title" value={form.title} onChange={update('title')} placeholder="Directrice commerciale" className={INPUT} />
            </div>
          </div>

          {/* LinkedIn + Website: optional, enables the LinkedIn workflow */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-lead-linkedin" className={FIELD_LABEL}>URL LinkedIn</label>
              <input id="add-lead-linkedin" value={form.linkedinUrl} onChange={update('linkedinUrl')} placeholder="linkedin.com/in/camille-martin" className={INPUT} />
              {form.linkedinUrl.trim() && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Messages LinkedIn activés pour ce lead
                </p>
              )}
            </div>
            <div>
              <label htmlFor="add-lead-website" className={FIELD_LABEL}>Site web</label>
              <input id="add-lead-website" value={form.website} onChange={update('website')} placeholder="entreprise.com" className={INPUT} />
            </div>
          </div>

          {/* Campaign */}
          {campaigns.length > 0 && (
            <div>
              <label htmlFor="add-lead-campaign" className={FIELD_LABEL}>Associer à une campagne</label>
              <select
                id="add-lead-campaign"
                value={form.campaignId}
                onChange={update('campaignId')}
                className={`${INPUT} appearance-none`}
              >
                <option value="" className="bg-obsidian">Sans campagne</option>
                {/* A finished campaign never sends again: not offered. */}
                {campaigns.filter((c) => c.status !== 'completed').map((c) => (
                  <option key={c.id} value={c.id} className="bg-obsidian">
                    {c.name} ({CAMPAIGN_STATUS_LABELS[c.status] ?? c.status})
                  </option>
                ))}
              </select>
              {form.campaignId && (
                <p className="mt-1 inline-flex items-start gap-1 text-[11px] text-cyan">
                  <Check className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                  {/* lib/sequences/queue-first-step sends to Fast Track and Normal only. */}
                  {form.scoreBadge === 'NURTURE'
                    ? 'Lié à la campagne. En Nurture, elle ne lui écrit pas.'
                    : 'Campagne active : son premier message part aussitôt. Sinon, au lancement.'}
                </p>
              )}
            </div>
          )}

          {/* Score badge */}
          <div>
            <p className={FIELD_LABEL} id="add-lead-priority">Priorité</p>
            <div className="flex gap-2" role="group" aria-labelledby="add-lead-priority">
              {SCORE_BADGES.map(({ value, label, on }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, scoreBadge: value }))}
                  aria-pressed={form.scoreBadge === value}
                  className={`flex-1 rounded-md border py-2 text-[11px] font-bold transition-colors duration-150 ease-signal ${
                    form.scoreBadge === value ? on : 'border-border bg-white/[0.03] text-muted hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Fast Track et Normal sont contactés par la campagne ; Nurture est gardé de côté.
            </p>
          </div>

          {/* Error */}
          {status === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-danger/25 px-3 py-2.5" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-danger" aria-hidden="true" />
              <p className="text-xs text-danger">{errorMsg}</p>
            </div>
          )}
        </form>
      )}
    </Dialog>
  )
}
