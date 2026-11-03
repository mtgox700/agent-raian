'use client'

import { useState } from 'react'
import { AlertCircle, Check, CheckCircle, Loader2, UserPlus } from 'lucide-react'
import { ZodError } from 'zod'
import type { CallInput } from '@phantera/sdk'
import { Dialog } from '@/components/ui/dialog'
import { Button, Field, Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { addLeadCopy as t } from '@/lib/copy/leads'
import type { CampaignOption, LeadRow } from '@/lib/front/types-leads'
import { apiErrorMessage } from './errors'

type ScoreBadge = (typeof t.badges)[number]['value']

const ON: Record<ScoreBadge, string> = {
  FAST_TRACK: 'border-success/40 bg-surface text-success',
  NORMAL:     'border-accent/40 bg-surface text-accent',
  NURTURE:    'border-warning/40 bg-surface text-warning',
}

const FORM_ID = 'add-lead-form'
const EMPTY = {
  firstName: '', lastName: '', email: '', company: '', title: '', industry: '',
  linkedinUrl: '', website: '', campaignId: '', scoreBadge: 'FAST_TRACK' as ScoreBadge,
}

// What happens next, said for this lead: a Nurture lead is never contacted,
// and only a campaign that runs sends (lib/sequences/queue-first-step.ts).
function successMessage(campaignId: string, badge: ScoreBadge, campaigns: CampaignOption[]): string {
  if (!campaignId) return t.successNoCampaign
  if (badge === 'NURTURE') return t.successNurture
  return campaigns.find((c) => c.id === campaignId)?.status === 'active' ? t.successActive : t.successInactive
}

/** The created row, in the shape of the table (fields the endpoint does not return are empty). */
function toLeadRow(d: Awaited<ReturnType<typeof createLead>>['data']): LeadRow {
  return {
    id: d.id,
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    company: d.company,
    title: d.title,
    industry: d.industry,
    linkedinUrl: d.linkedinUrl,
    website: d.website,
    country: typeof d.country === 'string' ? d.country : null,
    companySize: null,
    source: d.source,
    apolloId: null,
    aiScore: d.aiScore,
    scoreBadge: (d.scoreBadge as LeadRow['scoreBadge']) ?? 'UNSCORED',
    scoreReason: d.scoreReason,
    status: d.status,
    doNotContact: typeof d.doNotContact === 'boolean' ? d.doNotContact : undefined,
    phone: typeof d.phone === 'string' ? d.phone : null,
    createdAt: d.createdAt,
    enrichment: d.enrichment,
  }
}

function createLead(body: CallInput<'leads.createManual'>['body']) {
  return api.call('leads.createManual', { body })
}

export function AddLeadModal({ open, workspaceId, campaigns, onClose, onLeadAdded }: {
  open: boolean
  workspaceId: string
  campaigns: CampaignOption[]
  onClose: () => void
  onLeadAdded: (lead: LeadRow) => void
}) {
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const isValid = Boolean(form.firstName.trim() && form.lastName.trim() && form.email.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || status === 'loading') return
    setStatus('loading')
    setErrorMsg('')
    try {
      const data = await createLead({
        workspaceId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        company: form.company.trim() || undefined,
        title: form.title.trim() || undefined,
        industry: form.industry.trim() || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        website: form.website.trim() || undefined,
        campaignId: form.campaignId || undefined,
        scoreBadge: form.scoreBadge,
      })
      setStatus('success')
      onLeadAdded(toLeadRow(data.data))
      // Auto-close after 1.2 s
      setTimeout(() => {
        onClose()
        setStatus('idle')
        setForm(EMPTY)
      }, 1200)
    } catch (err) {
      setStatus('error')
      // The contract checks the form before sending: its message is the server's own (e.g. « Email invalide »).
      setErrorMsg(err instanceof ZodError
        ? err.issues[0]?.message ?? t.unknownError
        : err instanceof TypeError ? t.network : apiErrorMessage(err, t.unknownError))
    }
  }

  const close = () => { if (status !== 'loading') onClose() }

  const footer = status === 'success' ? undefined : (
    <Button type="submit" form={FORM_ID} disabled={!isValid || status === 'loading'} className="w-full">
      {status === 'loading'
        ? <><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />{t.submitting}</>
        : <><UserPlus className="h-4 w-4" aria-hidden="true" />{t.submit}</>}
    </Button>
  )

  const required = <span className="text-danger" aria-hidden="true"> *</span>
  const offered = campaigns.filter((c) => c.status !== 'completed')

  return (
    <Dialog open={open} onClose={close} title={t.title} description={t.description} closeLabel={t.close} footer={footer}>
      {status === 'success' ? (
        <div className="flex flex-col items-center gap-3 px-2 py-6 text-center" role="status">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-success/40">
            <CheckCircle className="h-6 w-6 text-success" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-ink">{t.added}</p>
          <p className="text-sm text-quiet">{successMessage(form.campaignId, form.scoreBadge, campaigns)}</p>
        </div>
      ) : (
        <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="add-lead-first" label={<>{t.firstName}{required}</>}>
              <Input id="add-lead-first" size="sm" value={form.firstName} onChange={update('firstName')} placeholder={t.placeholders.firstName} required autoComplete="off" />
            </Field>
            <Field id="add-lead-last" label={<>{t.lastName}{required}</>}>
              <Input id="add-lead-last" size="sm" value={form.lastName} onChange={update('lastName')} placeholder={t.placeholders.lastName} required autoComplete="off" />
            </Field>
          </div>

          <Field id="add-lead-email" label={<>{t.email}{required}</>}>
            <Input id="add-lead-email" size="sm" type="email" value={form.email} onChange={update('email')} placeholder={t.placeholders.email} required autoComplete="off" />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="add-lead-company" label={t.company}>
              <Input id="add-lead-company" size="sm" value={form.company} onChange={update('company')} placeholder={t.placeholders.company} />
            </Field>
            <Field id="add-lead-title" label={t.jobTitle}>
              <Input id="add-lead-title" size="sm" value={form.title} onChange={update('title')} placeholder={t.placeholders.title} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              id="add-lead-linkedin"
              label={t.linkedin}
              hint={form.linkedinUrl.trim() ? <span className="inline-flex items-center gap-1 text-accent"><Check className="h-3 w-3" aria-hidden="true" />{t.linkedinOn}</span> : undefined}
            >
              <Input
                id="add-lead-linkedin"
                size="sm"
                value={form.linkedinUrl}
                onChange={update('linkedinUrl')}
                placeholder={t.placeholders.linkedin}
                aria-describedby={form.linkedinUrl.trim() ? 'add-lead-linkedin-hint' : undefined}
              />
            </Field>
            <Field id="add-lead-website" label={t.website}>
              <Input id="add-lead-website" size="sm" value={form.website} onChange={update('website')} placeholder={t.placeholders.website} />
            </Field>
          </div>

          {campaigns.length > 0 && (
            <Field
              id="add-lead-campaign"
              label={t.campaign}
              hint={form.campaignId ? (
                <span className="inline-flex items-start gap-1 text-accent">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  {form.scoreBadge === 'NURTURE' ? t.campaignNoteNurture : t.campaignNote}
                </span>
              ) : undefined}
            >
              <Select
                id="add-lead-campaign"
                size="sm"
                value={form.campaignId}
                onChange={update('campaignId')}
                aria-describedby={form.campaignId ? 'add-lead-campaign-hint' : undefined}
              >
                <option value="">{t.noCampaign}</option>
                {/* A finished campaign never sends again: not offered. */}
                {offered.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({t.campaignStatus[c.status] ?? c.status})</option>
                ))}
              </Select>
            </Field>
          )}

          <div>
            <p id="add-lead-priority" className="mb-2 text-sm font-medium text-ink">{t.priority}</p>
            <div className="flex gap-2" role="group" aria-labelledby="add-lead-priority">
              {t.badges.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, scoreBadge: value }))}
                  aria-pressed={form.scoreBadge === value}
                  className={cn(
                    'h-9 flex-1 rounded-md border font-mono text-xs transition-colors duration-200 ease-signal',
                    form.scoreBadge === value ? ON[value] : 'border-line text-quiet hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-quiet">{t.priorityNote}</p>
          </div>

          {status === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-danger/40 px-3 py-2.5" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm text-danger">{errorMsg}</p>
            </div>
          )}
        </form>
      )}
    </Dialog>
  )
}
