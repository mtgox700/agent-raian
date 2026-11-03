'use client'

import { CHANNEL_LABELS, isPhoneChannel, nextWizardChannel, toWizardChannel, type WizardChannel } from '@/lib/types/channels'
import { partialJsonField } from '@/lib/ai/partial-json-field'
import { useRef, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Sparkles, Mail,
  Plus, Trash2, Check, AlertCircle, Pencil,
  Linkedin,
  MessageCircle, MessageSquareText,
} from 'lucide-react'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { TONES, deduceLanguageFromGeos, type EmailStep, type MessageLanguage } from '@/lib/types/campaign-wizard'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { SequenceTimeline } from '@/components/sequences/SequenceTimeline'
import { LinkedInPlanHint } from '@/components/dashboard/LinkedInPlanHint'
import { LINKEDIN_LIMITS, estimateRenderedLength, inviteNoteFits } from '@/lib/multichannel/linkedin-limits'

// ─── SSE event types ──────────────────────────────────────────────────────────

interface SSEEvent {
  type: 'email_start' | 'status' | 'chunk' | 'critique' | 'email_done'
      | 'invite_note_start' | 'invite_note_done' | 'invite_note_failed'
      | 'sequence_done' | 'error'
  message?: string
  emailIndex?: number
  total?: number
  dayOffset?: number
  channel?: WizardChannel
  text?: string
  score?: number
  notes?: string
  criteria?: Record<string, boolean>
  subject?: string
  body?: string
  attempts?: number
  totalEmails?: number
  /** ≤300-char note attached to the LinkedIn connection request (first touch). */
  inviteNote?: string
  /** True when the server had to shorten the model's note to fit the cap. */
  clamped?: boolean
}

// ─── Pipeline designer ────────────────────────────────────────────────────────
// The user architects the outreach flow BEFORE generation: which day, which
// channel. Presets encode proven SDR playbooks; "custom" unlocks free editing.

import type { SequencePlanStep } from '@/lib/types/campaign-wizard'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-void'

const DEFAULT_PLAN: SequencePlanStep[] = [
  { dayOffset: 0, channel: 'email' },
  { dayOffset: 3, channel: 'email' },
  { dayOffset: 7, channel: 'email' },
]

const PIPELINE_PRESETS: { id: string; label: string; hint: string; plan: SequencePlanStep[] }[] = [
  {
    id: 'email',
    label: 'E-mail classique',
    hint: 'J1, J3, J7 : la valeur sûre',
    plan: DEFAULT_PLAN,
  },
  {
    id: 'multicanal',
    label: 'Multicanal',
    hint: 'J1 e-mail, J3 LinkedIn, J7 e-mail',
    plan: [
      { dayOffset: 0, channel: 'email' },
      { dayOffset: 3, channel: 'linkedin' },
      { dayOffset: 7, channel: 'email' },
    ],
  },
  {
    id: 'linkedin-first',
    label: 'LinkedIn d\'abord',
    hint: 'J1 LinkedIn, J3 e-mail, J8 LinkedIn : pour cibles très sollicitées',
    plan: [
      { dayOffset: 0, channel: 'linkedin' },
      { dayOffset: 3, channel: 'email' },
      { dayOffset: 8, channel: 'linkedin' },
    ],
  },
  {
    // Requested by the founder (2026-09-04): "LinkedIn first" was mistaken for a
    // LinkedIn-only pipeline and shipped an email at J+3. A campaign that never
    // touches email now has its own explicit preset.
    id: 'linkedin-only',
    label: '100 % LinkedIn',
    hint: 'J1, J3, J8 tout en LinkedIn : aucun e-mail envoyé',
    plan: [
      { dayOffset: 0, channel: 'linkedin' },
      { dayOffset: 3, channel: 'linkedin' },
      { dayOffset: 8, channel: 'linkedin' },
    ],
  },
]

/** Human-readable channel mix, so a preset can never be picked blind. */
function planSummary(plan: SequencePlanStep[]): string {
  const count = (c: WizardChannel) => plan.filter((s) => (s.channel ?? 'email') === c).length
  const em = count('email'), li = count('linkedin'), wa = count('whatsapp'), sms = count('sms')
  const parts: string[] = []
  if (li > 0) parts.push(`${li} message${li > 1 ? 's' : ''} LinkedIn`)
  if (em > 0) parts.push(`${em} e-mail${em > 1 ? 's' : ''}`)
  if (wa > 0) parts.push(`${wa} WhatsApp`)
  if (sms > 0) parts.push(`${sms} SMS`)
  return parts.join(', ')
}

/**
 * Next channel for a step. The first step starts the sequence for every lead
 * at launch, so it stays one Phantera sends (email or LinkedIn); WhatsApp and
 * SMS come as follow-ups, sent by the user from their phone.
 */
function cycleChannel(channel: WizardChannel | undefined, isFirst: boolean): WizardChannel {
  const next = nextWizardChannel(channel)
  return isFirst && isPhoneChannel(next) ? 'email' : next
}

function ChannelIcon({ channel, className }: { channel: WizardChannel | undefined; className?: string }) {
  switch (channel) {
    case 'linkedin': return <Linkedin className={cn(className, 'text-white/80')} aria-hidden />
    case 'whatsapp': return <MessageCircle className={cn(className, 'text-gold')} aria-hidden />
    case 'sms':      return <MessageSquareText className={cn(className, 'text-gold')} aria-hidden />
    default:         return <Mail className={cn(className, 'text-cyan')} aria-hidden />
  }
}

function samePlan(a: SequencePlanStep[], b: SequencePlanStep[]): boolean {
  return a.length === b.length && a.every((s, i) => s.dayOffset === b[i].dayOffset && s.channel === b[i].channel)
}

function PipelineSelector({
  plan,
  onChange,
}: {
  plan: SequencePlanStep[]
  onChange: (plan: SequencePlanStep[]) => void
}) {
  const activePreset = PIPELINE_PRESETS.find((p) => samePlan(p.plan, plan))?.id ?? 'custom'

  const updateSlot = (i: number, patch: Partial<SequencePlanStep>) =>
    onChange(plan.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <div className="mb-8 rounded-[10px] border border-border bg-obsidian p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-semibold text-white">Votre rythme de relance</h3>
        <p className="mt-0.5 text-xs text-muted">
          Choisissez le rythme et les canaux : l&apos;IA rédige chaque étape dans le bon format
          (e-mail complet ou message LinkedIn court).
        </p>
      </div>

      {/* Presets */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PIPELINE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.plan.map((s) => ({ ...s })))}
            aria-pressed={activePreset === p.id}
            className={cn(
              'rounded-md border p-3 text-left transition-colors duration-150 ease-signal',
              FOCUS_RING,
              activePreset === p.id
                ? 'border-cyan bg-cyan/[0.06]'
                : 'border-border hover:border-white/20',
            )}
          >
            <p className={cn('text-xs font-semibold', activePreset === p.id ? 'text-cyan' : 'text-white')}>
              {p.label}
            </p>
            <p className="mt-0.5 font-mono text-xs leading-relaxed text-muted">{p.hint}</p>
          </button>
        ))}
      </div>

      {/* Timeline chips: the plan itself, fully editable */}
      <div className="flex flex-wrap items-center gap-2">
        {plan.map((slot, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-3 bg-border" aria-hidden="true" />}
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-void py-1 pl-1 pr-1.5">
              {/* Channel toggle */}
              <button
                type="button"
                onClick={() => updateSlot(i, { channel: cycleChannel(slot.channel, i === 0) })}
                title={`${CHANNEL_LABELS[slot.channel ?? 'email']} : cliquer pour changer de canal`}
                aria-label={`Canal : ${CHANNEL_LABELS[slot.channel ?? 'email']}`}
                className={cn('flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors duration-150 ease-signal hover:border-cyan/50', FOCUS_RING)}
              >
                <ChannelIcon channel={slot.channel} className="h-3 w-3" />
              </button>
              {/* Day */}
              <span className="font-mono text-xs text-muted" aria-hidden>J+</span>
              <input
                type="number"
                min={0}
                max={60}
                value={slot.dayOffset}
                aria-label={`Jour de l'étape ${i + 1}`}
                onChange={(e) => updateSlot(i, { dayOffset: Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)) })}
                className="w-10 rounded border border-border bg-transparent px-1 py-0.5 text-center font-mono text-xs tabular-nums text-white outline-none focus:border-cyan/50"
              />
              {/* Remove */}
              {plan.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(plan.filter((_, idx) => idx !== i))}
                  title="Retirer cette étape"
                  aria-label={`Retirer l'étape ${i + 1}`}
                  className={cn('flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-signal hover:text-danger', FOCUS_RING)}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
          </div>
        ))}

        {plan.length < 7 && (
          <button
            type="button"
            onClick={() => {
              const last = plan[plan.length - 1]
              // Inherit the previous step's channel instead of forcing email:
              // adding a step to a 100% LinkedIn pipeline used to silently slip
              // an email into it (founder report, 2026-09-04).
              onChange([...plan, {
                dayOffset: Math.min(60, (last?.dayOffset ?? 0) + 4),
                channel: last?.channel ?? 'email',
              }])
            }}
            className={cn('flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors duration-150 ease-signal hover:border-cyan/50 hover:text-cyan', FOCUS_RING)}
          >
            <Plus className="h-3 w-3" aria-hidden /> Étape
          </button>
        )}
      </div>

      {/* What this plan ACTUALLY sends. Presets can be misread ("LinkedIn
          first" still contains an email at J+3), so the real channel mix is
          spelled out before any campaign goes live. */}
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
        Cette séquence enverra{' '}
        <span className="font-semibold text-white">{planSummary(plan)}</span>.
      </p>
    </div>
  )
}

// ─── Email card ───────────────────────────────────────────────────────────────

function EmailCard({
  step,
  index,
  isStreaming,
  streamText,
  onDelete,
  onUpdate,
}: {
  step: EmailStep
  index: number
  isStreaming?: boolean
  streamText?: string
  onDelete: () => void
  onUpdate?: (patch: Partial<EmailStep>) => void
}) {
  // Manual emails are always editable; AI-generated emails become editable on
  // demand via the "Éditer" toggle so the user can fix mistakes after generation.
  const [isEditing, setIsEditing] = useState(false)

  const displayBody = isStreaming ? (streamText ?? '') : step.body
  const canEdit     = !isStreaming && Boolean(onUpdate)
  // Manual -> always editable. AI -> editable only while the user is editing it.
  const isEditable  = canEdit && (!step.isAiGenerated || isEditing)
  const showEditToggle = canEdit && step.isAiGenerated

  return (
    <div className="group relative overflow-hidden rounded-[10px] border border-border bg-obsidian transition-colors duration-150 ease-signal hover:border-white/20">

      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
        <span className="flex-shrink-0 font-mono text-xs tabular-nums text-cyan">
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Channel switch: email (default) or LinkedIn DM. LinkedIn steps
            have no subject line (it's a chat message). */}
        {canEdit ? (
          <button
            type="button"
            onClick={() => onUpdate?.({ channel: cycleChannel(step.channel, index === 0) })}
            title={`Canal : ${CHANNEL_LABELS[step.channel ?? 'email']} : cliquer pour changer`}
            aria-label={`Canal : ${CHANNEL_LABELS[step.channel ?? 'email']}`}
            className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border transition-colors duration-150 ease-signal hover:border-cyan/50', FOCUS_RING)}
          >
            <ChannelIcon channel={step.channel} className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChannelIcon channel={step.channel} className="h-3.5 w-3.5 flex-shrink-0" />
        )}

        {/* Subject: email only (LinkedIn DMs carry no subject) */}
        {step.channel === 'linkedin' ? (
          <span className="flex-1 truncate text-xs font-semibold text-white/80">
            Message LinkedIn
          </span>
        ) : isPhoneChannel(step.channel) ? (
          <span className="flex-1 truncate text-xs font-semibold text-gold">
            {CHANNEL_LABELS[step.channel ?? 'email']} : {step.channel === 'sms' ? 'automatique si SMS connecté, sinon depuis votre téléphone' : 'envoyé depuis votre téléphone'}
          </span>
        ) : isEditable ? (
          <input
            type="text"
            value={step.subject}
            onChange={(e) => onUpdate?.({ subject: e.target.value })}
            placeholder="Objet de l'e-mail..."
            aria-label={`Objet du message ${index + 1}`}
            className="flex-1 rounded bg-transparent text-xs font-semibold text-white outline-none placeholder:text-muted/60 focus:bg-white/[0.03] focus:px-1.5 focus:py-0.5"
          />
        ) : (
          <span className="flex-1 truncate text-xs font-semibold text-white">
            {isStreaming ? '...' : step.subject}
          </span>
        )}

        {/* Day offset: editable for manual */}
        {isEditable ? (
          <div className="flex items-center gap-1 font-mono text-xs text-muted">
            <span aria-hidden>J+</span>
            <input
              type="number"
              min={0}
              max={60}
              value={step.dayOffset}
              aria-label={`Jour d'envoi du message ${index + 1}`}
              onChange={(e) => onUpdate?.({ dayOffset: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="w-10 rounded border border-border bg-white/[0.03] px-1 py-0.5 text-center font-mono text-xs tabular-nums text-white outline-none focus:border-cyan/50"
            />
          </div>
        ) : (
          <span className="font-mono text-xs tabular-nums text-muted">J+{step.dayOffset}</span>
        )}

        {!isStreaming && step.isAiGenerated && (
          <span className={cn(
            'flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs',
            isEditing
              ? 'border-gold/30 text-gold'
              : 'border-cyan/25 text-cyan',
          )}>
            <Sparkles className="h-3 w-3" aria-hidden /> {isEditing ? 'IA, retouché' : 'IA'}
          </span>
        )}

        {/* Edit toggle: lets the user correct an AI-generated email by hand */}
        {showEditToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing((v) => !v)}
            aria-pressed={isEditing}
            aria-label={isEditing ? 'Terminer la modification' : `Modifier le message ${index + 1}`}
            className={cn(
              'h-7 gap-1 border px-2 text-xs',
              isEditing
                ? 'border-success-fg/30 text-success-fg hover:text-success-fg'
                : 'border-border text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100 hover:text-cyan',
            )}
            title={isEditing ? 'Terminer la modification' : 'Modifier ce message'}
          >
            {isEditing ? <Check className="h-3 w-3" aria-hidden /> : <Pencil className="h-3 w-3" aria-hidden />}
            <span className="hidden sm:inline">{isEditing ? 'Terminé' : 'Modifier'}</span>
          </Button>
        )}

        {!isStreaming && !step.isAiGenerated && (
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted">
            Manuel
          </span>
        )}

        {isStreaming && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-cyan" role="status">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden />
            Rédaction...
          </span>
        )}

        {!isStreaming && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Supprimer le message ${index + 1}`}
            title="Supprimer ce message"
            className="h-7 w-7 text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100 hover:text-danger"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </Button>
        )}
      </div>

      {/* Body: editable for manual, static for AI/streaming */}
      <div className="px-4 py-3">
        {isEditable ? (
          <>
            <textarea
              value={step.body}
              onChange={(e) => onUpdate?.({ body: e.target.value })}
              placeholder="Écrivez votre message ici. Variables disponibles : {{firstName}}, {{lastName}}, {{company}}, {{title}}, {{industry}}"
              aria-label={`Texte du message ${index + 1}`}
              rows={8}
              className="w-full resize-none bg-transparent font-sans text-xs leading-relaxed text-white outline-none placeholder:text-muted/60"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2">
              <span className="font-mono text-xs text-muted">Variables :</span>
              {['{{firstName}}', '{{lastName}}', '{{company}}', '{{title}}', '{{industry}}'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    onUpdate?.({ body: (step.body ?? '') + ' ' + v })
                  }}
                  className={cn('rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted transition-colors duration-150 ease-signal hover:border-cyan/50 hover:text-cyan', FOCUS_RING)}
                >
                  {v}
                </button>
              ))}
            </div>
          </>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted">
            {displayBody}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-cyan align-middle" aria-hidden />
            )}
          </pre>
        )}
      </div>

      {step.channel === 'linkedin' && step.inviteNote !== undefined && (
        <InviteNoteBlock
          note={step.inviteNote}
          editable={isEditable}
          onChange={(inviteNote) => onUpdate?.({ inviteNote })}
        />
      )}
    </div>
  )
}

// ─── LinkedIn invitation note ────────────────────────────────────────────────
// Shown on the FIRST LinkedIn touch only. When the lead is not a 1st-degree
// relation, Phantera sends a connection request instead of a DM, and LinkedIn
// caps that note at 300 chars on every plan. The counter measures the RENDERED
// length ({{firstName}} becomes a real name at send time), because that is what
// LinkedIn actually truncates.

function InviteNoteBlock({
  note,
  editable,
  onChange,
}: {
  note: string
  editable: boolean
  onChange: (value: string) => void
}) {
  const rendered = estimateRenderedLength(note)
  const max = LINKEDIN_LIMITS.INVITE_NOTE_MAX
  const over = rendered > max
  // 120-180 chars measurably outperform notes that fill the full 300.
  const sweetSpot = rendered >= 120 && rendered <= 180

  return (
    <div className="border-t border-border bg-void px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Linkedin className="h-3 w-3 text-white/80" aria-hidden />
          <span className="font-mono text-xs text-muted">
            Note de connexion
          </span>
        </div>
        <span
          className={cn(
            'font-mono text-xs tabular-nums',
            over
              ? 'text-danger'
              : sweetSpot
                ? 'text-success-fg'
                : 'text-muted',
          )}
          title="Longueur estimée une fois les variables remplacées"
        >
          ≈ {rendered}/{max}
        </span>
      </div>

      {editable ? (
        <textarea
          value={note}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Note jointe à la demande de connexion (300 caractères max)"
          aria-label="Note de connexion LinkedIn"
          className={cn(
            'w-full resize-none bg-transparent font-sans text-xs leading-relaxed text-white outline-none placeholder:text-muted/60',
            over && 'text-danger',
          )}
        />
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted">
          {note}
        </pre>
      )}

      <p className={cn('mt-2 text-xs leading-relaxed', over ? 'text-danger' : 'text-muted')}>
        {over
          ? `Trop longue de ${rendered - max} caractères : LinkedIn la couperait. Raccourcissez-la pour pouvoir lancer la campagne.`
          : 'Envoyée uniquement si le prospect n’est pas encore en relation. Une fois l’invitation acceptée, c’est le message ci-dessus qui part.'}
      </p>
    </div>
  )
}

// ─── Generation status overlay ────────────────────────────────────────────────

function GenerationStatus({
  status,
  currentEmail,
  totalEmails,
}: {
  status: string
  currentEmail: number
  totalEmails: number
}) {
  const done = Math.min(currentEmail, totalEmails)
  return (
    <div className="rounded-[10px] border border-cyan/25 bg-obsidian p-4" role="status" aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden />
          <span className="text-xs font-semibold text-cyan">Rédaction en cours</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted">
          Message {Math.min(currentEmail + 1, totalEmails)}/{totalEmails}
        </span>
      </div>

      <div
        className="mb-3 h-1 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-label="Avancement de la rédaction"
        aria-valuemin={0}
        aria-valuemax={totalEmails}
        aria-valuenow={done}
      >
        <div
          className="h-full origin-left rounded-full bg-cyan transition-transform duration-200 ease-signal"
          style={{ transform: `scaleX(${totalEmails > 0 ? done / totalEmails : 0})` }}
        />
      </div>

      <p className="text-xs text-muted">{status}</p>
    </div>
  )
}

/** Below this, the copywriter has nothing real to say about the offer. */
const MIN_VALUE_PROP_LENGTH = 20

// ─── Main Step ────────────────────────────────────────────────────────────────

export function Step3Sequence() {
  const { data, updateStep3, nextStep, prevStep, setGeneratingAI, isGeneratingAI } = useCampaignWizard()
  const { step3 } = data

  const [genStatus, setGenStatus] = useState('')
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0)
  const [genTotal, setGenTotal] = useState((step3.sequencePlan ?? DEFAULT_PLAN).length)
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null)
  // The writer streams JSON ({"subject":…,"body":…}); the card shows only the
  // body text extracted from it, never the raw JSON.
  const [streamBuffer, setStreamBuffer] = useState('')
  const rawStreamRef = useRef('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const valuePropReady = step3.valueProposition.trim().length >= MIN_VALUE_PROP_LENGTH

  const handleGenerate = async () => {
    if (!valuePropReady) {
      setError(`Décrivez votre offre (au moins ${MIN_VALUE_PROP_LENGTH} caractères) : sans elle, l'IA inventerait ce que vous vendez.`)
      return
    }
    setError(null)
    setGeneratingAI(true)
    updateStep3({ emailSteps: [] })
    setCurrentEmailIndex(0)

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ai/generate-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignData: data }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const errData = await res.json() as { error?: string }
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false
      const builtSteps: EmailStep[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: SSEEvent
          try {
            event = JSON.parse(line.slice(6)) as SSEEvent
          } catch {
            continue // malformed event
          }
          {
            switch (event.type) {
              case 'email_start':
                setCurrentEmailIndex(event.emailIndex ?? 0)
                if (event.total) setGenTotal(event.total)
                setStreamingIndex(event.emailIndex ?? 0)
                rawStreamRef.current = ''
                setStreamBuffer('')
                setGenStatus(`Rédaction du message ${(event.emailIndex ?? 0) + 1}/${event.total ?? 3}...`)
                break

              case 'status':
                // A new attempt (auto-critique retry) restarts the JSON.
                rawStreamRef.current = ''
                setStreamBuffer('')
                setGenStatus(event.message ?? '')
                break

              case 'chunk':
                rawStreamRef.current += event.text ?? ''
                setStreamBuffer(partialJsonField(rawStreamRef.current, 'body'))
                break

              case 'critique':
                setGenStatus(`Relecture : ${event.score}/100${event.score && event.score >= 75 ? ', retenu' : ', réécriture si une tentative reste'}`)
                break

              case 'email_done': {
                const newStep: EmailStep = {
                  id: `ai-${event.emailIndex}-${Date.now()}`,
                  dayOffset: event.dayOffset ?? 0,
                  channel: toWizardChannel(event.channel),
                  subject: event.subject ?? '',
                  body: event.body ?? '',
                  isAiGenerated: true,
                }
                builtSteps.push(newStep)
                updateStep3({ emailSteps: [...builtSteps] })
                setStreamingIndex(null)
                rawStreamRef.current = ''
                setStreamBuffer('')
                break
              }

              case 'invite_note_start':
                setGenStatus('Rédaction de la note de connexion LinkedIn (300 caractères max)...')
                break

              case 'invite_note_done': {
                // Attach the note to the LinkedIn step it belongs to. The step
                // was pushed by the preceding 'email_done'.
                const target = builtSteps.findIndex((_, i) => i === event.emailIndex)
                if (target >= 0 && event.inviteNote) {
                  builtSteps[target] = { ...builtSteps[target], inviteNote: event.inviteNote }
                  updateStep3({ emailSteps: [...builtSteps] })
                }
                break
              }

              case 'invite_note_failed':
                // Non blocking: the sender falls back to a safely-fitted body.
                setGenStatus('Note de connexion non générée : le message sera raccourci automatiquement')
                break

              case 'sequence_done':
                finished = true
                setGenStatus('Séquence rédigée')
                setGeneratingAI(false)
                setStreamingIndex(null)
                break

              case 'error':
                // Thrown outside the parse guard: a server error used to be
                // swallowed and left the spinner running forever.
                throw new Error(event.message ?? 'La génération a échoué')
            }
          }
        }
      }

      if (!finished) {
        setGeneratingAI(false)
        setStreamingIndex(null)
        setError(
          builtSteps.length > 0
            ? `La génération s'est interrompue après ${builtSteps.length} message${builtSteps.length > 1 ? 's' : ''}. Vous pouvez les garder ou régénérer.`
            : "La génération s'est interrompue. Réessayez.",
        )
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        setError(message)
        setGeneratingAI(false)
        setStreamingIndex(null)
      }
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setGeneratingAI(false)
    setStreamingIndex(null)
  }

  const deleteStep = (id: string) => {
    updateStep3({ emailSteps: step3.emailSteps.filter((s) => s.id !== id) })
  }

  const addBlankStep = () => {
    const newStep: EmailStep = {
      id: `custom-${Date.now()}`,
      dayOffset: (step3.emailSteps.at(-1)?.dayOffset ?? -4) + 4,
      subject: '',
      body: 'Bonjour {{firstName}},\n\n\n\nÀ bientôt,',
      isAiGenerated: false,
    }
    updateStep3({ emailSteps: [...step3.emailSteps, newStep] })
  }

  const updateStep = (id: string, patch: Partial<EmailStep>) => {
    updateStep3({
      emailSteps: step3.emailSteps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }

  const totalEmails = step3.emailSteps.length + (streamingIndex !== null ? 1 : 0)

  // Can advance to next step: at least 1 email with both subject AND body non-empty
  // LinkedIn DMs have no subject: only the body is required for them.
  const isStepComplete = (s: EmailStep) =>
    s.body.trim().length > 0
    && ((s.channel ?? 'email') !== 'email' || s.subject.trim().length > 0)

  // An oversized connection note is silently truncated by LinkedIn, so it must
  // block the launch here rather than surface as a mangled message in the
  // prospect's inbox (founder report, 2026-09-03).
  const oversizedNotes = step3.emailSteps.filter(
    (s) => s.inviteNote !== undefined && !inviteNoteFits(s.inviteNote),
  )

  const canProceed = step3.emailSteps.length > 0
    && step3.emailSteps.every(isStepComplete)
    && oversizedNotes.length === 0

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Header */}
      <header className="mb-8">
        <p className="mb-3 font-mono text-xs text-cyan">Étape 03 sur 05</p>
        <h2 className="font-display text-3xl font-bold text-white">Séquence de messages</h2>
        <p className="mt-2 text-sm text-muted">
          L&apos;IA rédige chaque message, le relit et le réécrit s&apos;il obtient moins de 75/100,
          jusqu&apos;à trois tentatives.
        </p>
      </header>

      {/* Tone selector */}
      <fieldset className="mb-6">
        <legend className="mb-3 block font-mono text-xs text-muted">
          Ton de communication
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TONES.map(({ key, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => !isGeneratingAI && updateStep3({ tone: key })}
              disabled={isGeneratingAI}
              aria-pressed={step3.tone === key}
              className={cn(
                'rounded-md border p-3 text-left transition-colors duration-150 ease-signal',
                FOCUS_RING,
                step3.tone === key
                  ? 'border-cyan bg-cyan/[0.06]'
                  : 'border-border bg-obsidian hover:border-white/20',
                isGeneratingAI && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className={cn('block text-xs font-bold', step3.tone === key ? 'text-cyan' : 'text-white')}>{label}</span>
              <span className="mt-0.5 block text-xs text-muted">{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Language selector: ONE language per campaign (never bilingual).
          Default deduced from target geos; user can override. */}
      <fieldset className="mb-6">
        <legend className="mb-3 block font-mono text-xs text-muted">
          Langue des messages
          {!step3.language && (
            <span className="ml-2 text-cyan">automatique (zones ciblées)</span>
          )}
        </legend>
        <div className="flex gap-2">
          {([
            { key: 'fr' as MessageLanguage, label: 'Français', desc: 'France, Belgique, Suisse, Maghreb...' },
            { key: 'en' as MessageLanguage, label: 'Anglais', desc: 'États-Unis, Royaume-Uni, Allemagne, international...' },
          ]).map(({ key, label, desc }) => {
            const effective = step3.language ?? deduceLanguageFromGeos(data.step2.targetGeos)
            const active = effective === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => !isGeneratingAI && updateStep3({ language: key })}
                disabled={isGeneratingAI}
                aria-pressed={active}
                className={cn(
                  'flex-1 rounded-md border p-3 text-left transition-colors duration-150 ease-signal',
                  FOCUS_RING,
                  active
                    ? 'border-cyan bg-cyan/[0.06]'
                    : 'border-border bg-obsidian hover:border-white/20',
                  isGeneratingAI && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className={cn('block text-xs font-bold', active ? 'text-cyan' : 'text-white')}>{label}</span>
                <span className="mt-0.5 block text-xs text-muted">{desc}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Value prop */}
      <div className="mb-8">
        <label htmlFor="value-proposition" className="mb-2 block font-mono text-xs text-muted">
          Votre proposition de valeur
          <span className="ml-1 text-muted">(obligatoire pour la génération IA)</span>
        </label>
        <textarea
          id="value-proposition"
          value={step3.valueProposition}
          onChange={(e) => !isGeneratingAI && updateStep3({ valueProposition: e.target.value })}
          disabled={isGeneratingAI}
          placeholder="ex. : Nous aidons les équipes commerciales B2B à trouver des prospects qualifiés en automatisant la prospection à froid."
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-obsidian px-4 py-3 text-sm text-white placeholder-muted/60 outline-none transition-colors duration-150 ease-signal focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20 disabled:opacity-50"
        />
        <p className={cn('mt-1.5 text-xs', valuePropReady ? 'text-muted' : 'text-warning')}>
          {valuePropReady
            ? "L'IA s'appuie uniquement sur ce texte pour parler de votre offre."
            : `Ce que vous vendez, à qui, et le résultat obtenu (au moins ${MIN_VALUE_PROP_LENGTH} caractères). Sans cela, l'IA inventerait votre offre.`}
        </p>
      </div>

      {/* Error */}
      {error && (() => {
        const isPlan = error.toLowerCase().includes('pro')
        return (
          <div
            role="alert"
            className={cn(
              'mb-6 flex items-start gap-3 rounded-[10px] border bg-obsidian px-4 py-3',
              isPlan ? 'border-warning/30' : 'border-danger/30',
            )}
          >
            <AlertCircle className={cn('mt-0.5 h-4 w-4 flex-shrink-0', isPlan ? 'text-warning' : 'text-danger')} aria-hidden />
            <div className="flex-1">
              <p className={cn('text-xs font-semibold', isPlan ? 'text-warning' : 'text-danger')}>
                {isPlan ? 'Fonctionnalité Pro' : 'Erreur de génération'}
              </p>
              <p className="text-xs text-muted">
                {isPlan
                  ? "La génération IA est réservée au plan Pro. Rédigez vos messages vous-même ci-dessous ou passez à Pro."
                  : error}
              </p>
              {isPlan && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href="/dashboard/settings?tab=billing"
                    className={cn(buttonVariants({ variant: 'gold', size: 'sm' }), 'h-8 px-3 text-xs')}
                  >
                    Passer à Pro
                  </a>
                  <span className="text-xs text-muted">ou continuez avec vos propres messages ci-dessous</span>
                </div>
              )}
              {error.includes('ANTHROPIC_API_KEY') && (
                <p className="mt-1 font-mono text-xs text-muted">
                  Ajoutez ANTHROPIC_API_KEY dans votre fichier .env.local
                </p>
              )}
            </div>
          </div>
        )
      })()}

      {/* Pipeline designer: the user architects the relance flow BEFORE
          generation (Jour + canal). Drives the AI: email steps get the cold
          email engine, LinkedIn steps get the dedicated DM engine. */}
      {step3.emailSteps.length === 0 && !isGeneratingAI && (
        <>
          <PipelineSelector
            plan={step3.sequencePlan ?? DEFAULT_PLAN}
            onChange={(plan) => updateStep3({ sequencePlan: plan })}
          />
          {/* Free vs Premium education, shown as soon as the pipeline
              includes a LinkedIn step (Victoria: inform, never block) */}
          {(step3.sequencePlan ?? DEFAULT_PLAN).some((s) => s.channel === 'linkedin') && (
            <LinkedInPlanHint className="mb-8" />
          )}
          {(step3.sequencePlan ?? DEFAULT_PLAN).some((s) => isPhoneChannel(s.channel)) && (
            <p className="mb-8 rounded-[10px] border border-gold/25 bg-obsidian px-4 py-3 text-xs leading-relaxed text-muted">
              Les SMS partent automatiquement si vous avez connecté votre compte Brevo (Paramètres, onglet E-mails et canaux),
              avec la mention STOP. Les WhatsApp, et les SMS sans Brevo, sont rangés dans « À envoyer » le jour prévu :
              vous les envoyez d&apos;un geste depuis votre téléphone (WhatsApp bannit les comptes qui écrivent seuls à
              des inconnus). Les leads sans numéro passent l&apos;étape, et la séquence continue.
            </p>
          )}
        </>
      )}

      {/* Generate CTA */}
      {step3.emailSteps.length === 0 && !isGeneratingAI && (
        <div className="mb-8 text-center">
          <Button size="lg" onClick={handleGenerate} disabled={!valuePropReady} className="gap-2 px-8">
            <Sparkles className="h-4 w-4" aria-hidden />
            Rédiger la séquence avec l&apos;IA
          </Button>
          <p className="mt-3 font-mono text-xs text-muted">
            Relecture automatique, seuil 75/100, trois tentatives au plus par message
          </p>
        </div>
      )}

      {/* Generation progress */}
      {isGeneratingAI && (
        <div className="mb-6">
          <GenerationStatus
            status={genStatus}
            currentEmail={currentEmailIndex}
            totalEmails={genTotal}
          />
          <Button variant="ghost" size="sm" onClick={handleStop} className="mt-2 h-8 px-2 text-xs text-muted">
            Annuler
          </Button>
        </div>
      )}

      {/* Add manual step: always visible when no AI emails yet */}
      {step3.emailSteps.length === 0 && !isGeneratingAI && (
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={addBlankStep}
            className="h-12 w-full gap-2 border-dashed text-xs text-muted hover:text-cyan"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Écrire un message vous-même
          </Button>
        </div>
      )}

      {/* Email steps */}
      {(step3.emailSteps.length > 0 || streamingIndex !== null) && (
        <div className="mb-6 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs tabular-nums text-muted">
              {step3.emailSteps.length} message{step3.emailSteps.length > 1 ? 's' : ''}
            </span>
            {!isGeneratingAI && valuePropReady && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                className="h-8 gap-1.5 px-2 text-xs text-cyan hover:text-cyan"
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                Régénérer
              </Button>
            )}
          </div>

          {/* Completed email steps */}
          {step3.emailSteps.map((step, i) => (
            <EmailCard
              key={step.id}
              step={step}
              index={i}
              isStreaming={false}
              onDelete={() => deleteStep(step.id)}
              onUpdate={(patch) => updateStep(step.id, patch)}
            />
          ))}

          {/* Currently streaming email */}
          {streamingIndex !== null && (
            <EmailCard
              key="streaming"
              step={{
                id: 'streaming',
                dayOffset: 0,
                subject: '',
                body: streamBuffer,
                isAiGenerated: true,
              }}
              index={step3.emailSteps.length}
              isStreaming={true}
              streamText={streamBuffer}
              onDelete={() => {}}
            />
          )}

          {/* Sequence timeline preview */}
          {step3.emailSteps.length > 0 && !isGeneratingAI && (
            <div className="rounded-[10px] border border-border bg-obsidian p-4">
              <SequenceTimeline
                steps={step3.emailSteps.map((s, i) => ({
                  id:        s.id,
                  position:  i,
                  dayOffset: s.dayOffset,
                  subject:   s.subject,
                }))}
              />
            </div>
          )}

          {/* Add manual step */}
          {!isGeneratingAI && (
            <Button
              variant="outline"
              onClick={addBlankStep}
              className="h-11 w-full gap-2 border-dashed text-xs text-muted hover:text-cyan"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter un message vous-même
            </Button>
          )}
        </div>
      )}

      {/* Validation hint */}
      {step3.emailSteps.length > 0 && !isGeneratingAI && (() => {
        const incomplete = step3.emailSteps.filter((s) => !isStepComplete(s))
        if (incomplete.length === 0) return null
        return (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-obsidian px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" aria-hidden />
            <p className="text-xs text-warning">
              {incomplete.length === 1
                ? '1 message incomplet : remplissez le texte (et l\'objet pour les e-mails) pour continuer.'
                : `${incomplete.length} messages incomplets : remplissez les textes (et les objets pour les e-mails) pour continuer.`}
            </p>
          </div>
        )
      })()}

      {/* LinkedIn note over the platform cap: blocks the launch */}
      {oversizedNotes.length > 0 && !isGeneratingAI && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-obsidian px-3 py-2" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-danger" aria-hidden />
          <p className="text-xs text-danger">
            {oversizedNotes.length === 1
              ? `Note de connexion trop longue : LinkedIn coupe à ${LINKEDIN_LIMITS.INVITE_NOTE_MAX} caractères. Raccourcissez-la pour continuer.`
              : `${oversizedNotes.length} notes de connexion trop longues : LinkedIn coupe à ${LINKEDIN_LIMITS.INVITE_NOTE_MAX} caractères. Raccourcissez-les pour continuer.`}
          </p>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" size="lg" onClick={prevStep} disabled={isGeneratingAI} className="gap-2 px-5">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Retour
        </Button>
        <Button size="lg" onClick={nextStep} disabled={!canProceed || isGeneratingAI} className="gap-2 px-6">
          Choisir les leads
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
