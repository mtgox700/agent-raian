'use client'

/**
 * Step 3: tone, language, value proposition, the follow-up rhythm (day and
 * channel of every step), then the sequence written by the AI
 * (ai.generateSequence, streamed: one event per step, auto-critique, LinkedIn
 * invitation note) or by hand. Same events and rules as body n°1.
 */
import { useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Linkedin, Mail, MessageCircle, MessageSquareText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Button, buttonVariants } from '@/components/ui'
import { SequenceTimeline } from '@/components/dashboard/shared/SequenceTimeline'
import { LinkedInPlanHint } from '@/components/dashboard/campaign-wizard/LinkedInPlanHint'
import { StepHeader, choiceClass, fieldLabel, textControl } from '@/components/dashboard/campaign-wizard/StepHeader'
import { emailCardCopy as c, pipelineCopy as p, step3Copy as t, wizardCopy } from '@/lib/copy/campaign-wizard'
import { api } from '@/lib/front/api'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { partialJsonField } from '@/lib/ai/partial-json-field'
import { LINKEDIN_LIMITS, estimateRenderedLength, inviteNoteFits } from '@/lib/multichannel/linkedin-limits'
import { TONES, deduceLanguageFromGeos, type EmailStep, type SequencePlanStep } from '@/lib/types/campaign-wizard'
import { CHANNEL_LABELS, isPhoneChannel, nextWizardChannel, toDbChannel, toWizardChannel, type WizardChannel } from '@/lib/types/channels'
import { cn } from '@/lib/utils'

interface SSEEvent {
  type: 'email_start' | 'status' | 'chunk' | 'critique' | 'email_done'
    | 'invite_note_start' | 'invite_note_done' | 'invite_note_failed' | 'sequence_done' | 'error'
  message?: string
  emailIndex?: number
  total?: number
  dayOffset?: number
  channel?: WizardChannel
  text?: string
  score?: number
  subject?: string
  body?: string
  inviteNote?: string
}

const DEFAULT_PLAN: SequencePlanStep[] = [
  { dayOffset: 0, channel: 'email' },
  { dayOffset: 3, channel: 'email' },
  { dayOffset: 7, channel: 'email' },
]

const PRESETS: { id: keyof typeof p.presets; plan: SequencePlanStep[] }[] = [
  { id: 'email', plan: DEFAULT_PLAN },
  { id: 'multicanal', plan: [{ dayOffset: 0, channel: 'email' }, { dayOffset: 3, channel: 'linkedin' }, { dayOffset: 7, channel: 'email' }] },
  { id: 'linkedin-first', plan: [{ dayOffset: 0, channel: 'linkedin' }, { dayOffset: 3, channel: 'email' }, { dayOffset: 8, channel: 'linkedin' }] },
  // A campaign that never touches e-mail has its own explicit preset.
  { id: 'linkedin-only', plan: [{ dayOffset: 0, channel: 'linkedin' }, { dayOffset: 3, channel: 'linkedin' }, { dayOffset: 8, channel: 'linkedin' }] },
]

const VARIABLES = ['{{firstName}}', '{{lastName}}', '{{company}}', '{{title}}', '{{industry}}']
/** Below this, the copywriter has nothing real to say about the offer. */
const MIN_VALUE_PROP_LENGTH = 20

const planSummary = (plan: SequencePlanStep[]) => {
  const count = (ch: WizardChannel) => plan.filter((s) => (s.channel ?? 'email') === ch).length
  return p.summary(count('linkedin'), count('email'), count('whatsapp'), count('sms'))
}
const samePlan = (a: SequencePlanStep[], b: SequencePlanStep[]) =>
  a.length === b.length && a.every((s, i) => s.dayOffset === b[i].dayOffset && s.channel === b[i].channel)

/** The first step starts the sequence at launch: it stays one Phantera sends (e-mail or LinkedIn). */
function cycleChannel(channel: WizardChannel | undefined, isFirst: boolean): WizardChannel {
  const next = nextWizardChannel(channel)
  return isFirst && isPhoneChannel(next) ? 'email' : next
}

function ChannelIcon({ channel, className }: { channel: WizardChannel | undefined; className?: string }) {
  switch (channel) {
    case 'linkedin': return <Linkedin className={cn(className, 'text-ink/80')} aria-hidden="true" />
    case 'whatsapp': return <MessageCircle className={cn(className, 'text-signal')} aria-hidden="true" />
    case 'sms': return <MessageSquareText className={cn(className, 'text-signal')} aria-hidden="true" />
    default: return <Mail className={cn(className, 'text-accent')} aria-hidden="true" />
  }
}

function PipelineSelector({ plan, onChange }: { plan: SequencePlanStep[]; onChange: (plan: SequencePlanStep[]) => void }) {
  const active = PRESETS.find((x) => samePlan(x.plan, plan))?.id ?? 'custom'
  const updateSlot = (i: number, patch: Partial<SequencePlanStep>) => onChange(plan.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <div className="mb-8 rounded-lg border border-line bg-raised p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-semibold text-ink">{p.title}</h3>
        <p className="mt-0.5 text-xs text-quiet">{p.intro}</p>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((x) => (
          <button key={x.id} type="button" onClick={() => onChange(x.plan.map((s) => ({ ...s })))} aria-pressed={active === x.id}
            className={cn('rounded-md border p-3 text-left transition-colors duration-200 ease-signal', active === x.id ? 'border-accent bg-accent/[0.06]' : 'border-line hover:border-quiet/50')}>
            <p className={cn('text-xs font-semibold', active === x.id ? 'text-accent' : 'text-ink')}>{p.presets[x.id].label}</p>
            <p className="mt-0.5 font-mono text-xs leading-relaxed text-quiet">{p.presets[x.id].hint}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {plan.map((slot, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-3 bg-line" aria-hidden="true" />}
            <div className="flex items-center gap-1.5 rounded-md border border-line bg-canvas py-1 pl-1 pr-1.5">
              <button type="button" onClick={() => updateSlot(i, { channel: cycleChannel(slot.channel, i === 0) })}
                title={p.channelTitle(CHANNEL_LABELS[slot.channel ?? 'email'])} aria-label={p.channel(CHANNEL_LABELS[slot.channel ?? 'email'])}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-line transition-colors duration-200 ease-signal hover:border-accent/50">
                <ChannelIcon channel={slot.channel} className="h-3 w-3" />
              </button>
              <span className="font-mono text-xs text-quiet" aria-hidden="true">J+</span>
              <input type="number" min={0} max={60} value={slot.dayOffset} aria-label={p.day(i + 1)}
                onChange={(e) => updateSlot(i, { dayOffset: Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)) })}
                className="w-10 rounded border border-line bg-transparent px-1 py-0.5 text-center font-mono text-xs tabular-nums text-ink outline-none focus:border-accent/50" />
              {plan.length > 1 && (
                <button type="button" onClick={() => onChange(plan.filter((_, idx) => idx !== i))} title={p.removeTitle} aria-label={p.remove(i + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:text-danger">
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
        {plan.length < 7 && (
          <button
            type="button"
            // Inherit the previous channel: a step added to a 100 % LinkedIn plan stays LinkedIn.
            onClick={() => {
              const last = plan[plan.length - 1]
              onChange([...plan, { dayOffset: Math.min(60, (last?.dayOffset ?? 0) + 4), channel: last?.channel ?? 'email' }])
            }}
            className="flex items-center gap-1 rounded-md border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-quiet transition-colors duration-200 ease-signal hover:border-accent/50 hover:text-accent"
          >
            <Plus className="h-3 w-3" aria-hidden="true" /> {p.addStep}
          </button>
        )}
      </div>
      {/* What this plan actually sends, spelled out before anything goes live. */}
      <p className="mt-3 border-t border-line pt-3 text-xs text-quiet">
        {p.willSend} <span className="font-semibold text-ink">{planSummary(plan)}</span>.
      </p>
    </div>
  )
}

/** The LinkedIn invitation note: LinkedIn caps it at 300 rendered characters on every plan. */
function InviteNoteBlock({ note, editable, onChange }: { note: string; editable: boolean; onChange: (v: string) => void }) {
  const rendered = estimateRenderedLength(note)
  const max = LINKEDIN_LIMITS.INVITE_NOTE_MAX
  const over = rendered > max
  const sweetSpot = rendered >= 120 && rendered <= 180
  return (
    <div className="border-t border-line bg-canvas px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5"><Linkedin className="h-3 w-3 text-ink/80" aria-hidden="true" /><span className="font-mono text-xs text-quiet">{c.noteTitle}</span></span>
        <span className={cn('font-mono text-xs tabular-nums', over ? 'text-danger' : sweetSpot ? 'text-success' : 'text-quiet')} title={c.noteLengthTitle}>≈ {rendered}/{max}</span>
      </div>
      {editable ? (
        <textarea value={note} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={c.notePh} aria-label={c.noteLabel}
          className={cn('w-full resize-none bg-transparent font-sans text-xs leading-relaxed text-ink outline-none placeholder:text-quiet/60', over && 'text-danger')} />
      ) : <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-quiet">{note}</pre>}
      <p className={cn('mt-2 text-xs leading-relaxed', over ? 'text-danger' : 'text-quiet')}>{over ? c.noteOver(rendered - max) : c.noteInfo}</p>
    </div>
  )
}

function EmailCard({ step, index, isStreaming, streamText, onDelete, onUpdate }: {
  step: EmailStep; index: number; isStreaming?: boolean; streamText?: string; onDelete: () => void; onUpdate?: (patch: Partial<EmailStep>) => void
}) {
  // Manual messages are always editable; AI ones on demand (« Modifier »).
  const [isEditing, setIsEditing] = useState(false)
  const canEdit = !isStreaming && Boolean(onUpdate)
  const isEditable = canEdit && (!step.isAiGenerated || isEditing)
  const label = CHANNEL_LABELS[step.channel ?? 'email']
  const n = index + 1

  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-raised transition-colors duration-200 ease-signal hover:border-quiet/50">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
        <span className="shrink-0 font-mono text-xs tabular-nums text-accent">{String(n).padStart(2, '0')}</span>
        {canEdit ? (
          <button type="button" onClick={() => onUpdate?.({ channel: cycleChannel(step.channel, index === 0) })} title={c.channelTitle(label)} aria-label={c.channel(label)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line transition-colors duration-200 ease-signal hover:border-accent/50">
            <ChannelIcon channel={step.channel} className="h-3.5 w-3.5" />
          </button>
        ) : <ChannelIcon channel={step.channel} className="h-3.5 w-3.5 shrink-0" />}

        {step.channel === 'linkedin' ? (
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink/80">{c.linkedin}</span>
        ) : isPhoneChannel(step.channel) ? (
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-signal">{c.phoneChannel(label, step.channel === 'sms')}</span>
        ) : isEditable ? (
          <input type="text" value={step.subject} onChange={(e) => onUpdate?.({ subject: e.target.value })} placeholder={c.subjectPh} aria-label={c.subject(n)}
            className="min-w-0 flex-1 rounded bg-transparent text-xs font-semibold text-ink outline-none placeholder:text-quiet/60 focus:bg-surface/50 focus:px-1.5 focus:py-0.5" />
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{isStreaming ? '...' : step.subject}</span>
        )}

        {isEditable ? (
          <span className="flex items-center gap-1 font-mono text-xs text-quiet">
            <span aria-hidden="true">J+</span>
            <input type="number" min={0} max={60} value={step.dayOffset} aria-label={c.day(n)}
              onChange={(e) => onUpdate?.({ dayOffset: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="w-10 rounded border border-line bg-surface/50 px-1 py-0.5 text-center font-mono text-xs tabular-nums text-ink outline-none focus:border-accent/50" />
          </span>
        ) : <span className="font-mono text-xs tabular-nums text-quiet">J+{step.dayOffset}</span>}

        {!isStreaming && step.isAiGenerated && (
          <span className={cn('flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs', isEditing ? 'border-signal/30 text-signal' : 'border-ai/25 text-ai')}>
            <Sparkles className="h-3 w-3" aria-hidden="true" /> {isEditing ? c.aiEdited : c.ai}
          </span>
        )}
        {canEdit && step.isAiGenerated && (
          <Button variant="ghost" size="sm" onClick={() => setIsEditing((v) => !v)} aria-pressed={isEditing}
            aria-label={isEditing ? c.doneEditing : c.edit(n)} title={isEditing ? c.doneEditing : c.editTitle}
            className={cn('h-7 gap-1 border px-2 text-xs', isEditing ? 'border-success/30 text-success hover:text-success' : 'border-line opacity-0 focus-visible:opacity-100 group-hover:opacity-100 hover:text-accent')}>
            {isEditing ? <Check className="h-3 w-3" aria-hidden="true" /> : <Pencil className="h-3 w-3" aria-hidden="true" />}
            <span className="max-sm:hidden">{isEditing ? c.doneShort : c.editShort}</span>
          </Button>
        )}
        {!isStreaming && !step.isAiGenerated && <span className="rounded-md border border-line px-2 py-0.5 font-mono text-xs text-quiet">{c.manual}</span>}
        {isStreaming && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-accent" role="status">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />{c.writing}
          </span>
        )}
        {!isStreaming && (
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label={c.delete(n)} title={c.deleteTitle}
            className="h-7 w-7 px-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 hover:text-danger">
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="px-4 py-3">
        {isEditable ? (
          <>
            <textarea value={step.body} onChange={(e) => onUpdate?.({ body: e.target.value })} placeholder={c.bodyPh} aria-label={c.body(n)} rows={8}
              className="w-full resize-none bg-transparent font-sans text-xs leading-relaxed text-ink outline-none placeholder:text-quiet/60" />
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2">
              <span className="font-mono text-xs text-quiet">{c.variables}</span>
              {VARIABLES.map((v) => (
                <button key={v} type="button" onClick={() => onUpdate?.({ body: (step.body ?? '') + ' ' + v })}
                  className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-quiet transition-colors duration-200 ease-signal hover:border-accent/50 hover:text-accent">
                  {v}
                </button>
              ))}
            </div>
          </>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-quiet">
            {isStreaming ? (streamText ?? '') : step.body}
            {isStreaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-accent align-middle" aria-hidden="true" />}
          </pre>
        )}
      </div>

      {step.channel === 'linkedin' && step.inviteNote !== undefined && (
        <InviteNoteBlock note={step.inviteNote} editable={isEditable} onChange={(inviteNote) => onUpdate?.({ inviteNote })} />
      )}
    </div>
  )
}

function GenerationStatus({ status, currentEmail, totalEmails }: { status: string; currentEmail: number; totalEmails: number }) {
  const done = Math.min(currentEmail, totalEmails)
  return (
    <div className="rounded-lg border border-accent/25 bg-raised p-4" role="status" aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /><span className="text-xs font-semibold text-accent">{t.inProgress}</span></span>
        <span className="font-mono text-xs tabular-nums text-quiet">{t.messageOf(Math.min(currentEmail + 1, totalEmails), totalEmails)}</span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={t.progressLabel} aria-valuemin={0} aria-valuemax={totalEmails} aria-valuenow={done}>
        <div className="h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-signal" style={{ transform: `scaleX(${totalEmails > 0 ? done / totalEmails : 0})` }} />
      </div>
      <p className="text-xs text-quiet">{status}</p>
    </div>
  )
}

export function Step3Sequence() {
  const { data, updateStep3, nextStep, prevStep, setGeneratingAI, isGeneratingAI } = useCampaignWizard()
  const { step3 } = data
  const plan = step3.sequencePlan ?? DEFAULT_PLAN

  const [genStatus, setGenStatus] = useState('')
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0)
  const [genTotal, setGenTotal] = useState(plan.length)
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null)
  // The writer streams JSON; the card shows only the body extracted from it.
  const [streamBuffer, setStreamBuffer] = useState('')
  const rawStreamRef = useRef('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const valuePropReady = step3.valueProposition.trim().length >= MIN_VALUE_PROP_LENGTH

  const handleGenerate = async () => {
    if (!valuePropReady) { setError(t.valuePropError(MIN_VALUE_PROP_LENGTH)); return }
    setError(null)
    setGeneratingAI(true)
    updateStep3({ emailSteps: [] })
    setCurrentEmailIndex(0)
    abortRef.current = new AbortController()

    try {
      let res: Response
      try {
        res = await api.call('ai.generateSequence', { body: { campaignData: data } }, { signal: abortRef.current.signal })
      } catch (err) {
        if (err instanceof ApiError) throw new Error(err.body?.error ?? `HTTP ${err.status}`)
        throw err
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error(t.noBody)

      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false
      const built: EmailStep[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: SSEEvent
          try { event = JSON.parse(line.slice(6)) as SSEEvent } catch { continue }
          switch (event.type) {
            case 'email_start':
              setCurrentEmailIndex(event.emailIndex ?? 0)
              if (event.total) setGenTotal(event.total)
              setStreamingIndex(event.emailIndex ?? 0)
              rawStreamRef.current = ''
              setStreamBuffer('')
              setGenStatus(t.writing((event.emailIndex ?? 0) + 1, event.total ?? 3))
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
              setGenStatus(t.critique(event.score))
              break
            case 'email_done':
              built.push({
                id: `ai-${event.emailIndex}-${Date.now()}`,
                dayOffset: event.dayOffset ?? 0,
                channel: toWizardChannel(event.channel),
                subject: event.subject ?? '',
                body: event.body ?? '',
                isAiGenerated: true,
              })
              updateStep3({ emailSteps: [...built] })
              setStreamingIndex(null)
              rawStreamRef.current = ''
              setStreamBuffer('')
              break
            case 'invite_note_start':
              setGenStatus(t.noteWriting)
              break
            case 'invite_note_done': {
              const target = built.findIndex((_, i) => i === event.emailIndex)
              if (target >= 0 && event.inviteNote) {
                built[target] = { ...built[target], inviteNote: event.inviteNote }
                updateStep3({ emailSteps: [...built] })
              }
              break
            }
            case 'invite_note_failed':
              setGenStatus(t.noteFailed)
              break
            case 'sequence_done':
              finished = true
              setGenStatus(t.done)
              setGeneratingAI(false)
              setStreamingIndex(null)
              break
            case 'error':
              // Thrown outside the parse guard: a server error must stop the spinner.
              throw new Error(event.message ?? t.failed)
          }
        }
      }

      if (!finished) {
        setGeneratingAI(false)
        setStreamingIndex(null)
        setError(built.length > 0 ? t.interruptedAfter(built.length) : t.interrupted)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : t.unknown)
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

  const addBlankStep = () => updateStep3({
    emailSteps: [...step3.emailSteps, {
      id: `custom-${Date.now()}`,
      dayOffset: (step3.emailSteps.at(-1)?.dayOffset ?? -4) + 4,
      subject: '',
      body: t.blankBody,
      isAiGenerated: false,
    }],
  })
  const updateStep = (id: string, patch: Partial<EmailStep>) => updateStep3({ emailSteps: step3.emailSteps.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

  // LinkedIn messages have no subject: only the body is required for them.
  const isStepComplete = (s: EmailStep) => s.body.trim().length > 0 && ((s.channel ?? 'email') !== 'email' || s.subject.trim().length > 0)
  // LinkedIn cuts an oversized note silently: it blocks the launch here.
  const oversized = step3.emailSteps.filter((s) => s.inviteNote !== undefined && !inviteNoteFits(s.inviteNote))
  const incomplete = step3.emailSteps.filter((s) => !isStepComplete(s))
  const canProceed = step3.emailSteps.length > 0 && incomplete.length === 0 && oversized.length === 0
  const effectiveLanguage = step3.language ?? deduceLanguageFromGeos(data.step2.targetGeos)
  const isPlanError = error ? error.toLowerCase().includes('pro') : false

  return (
    <div className="mx-auto max-w-2xl">
      <StepHeader step={3} title={t.title} intro={t.intro} />

      <fieldset className="mb-6">
        <legend className={cn(fieldLabel, 'mb-3')}>{t.tone}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TONES.map(({ key, label, desc }) => (
            <button key={key} type="button" onClick={() => !isGeneratingAI && updateStep3({ tone: key })} disabled={isGeneratingAI} aria-pressed={step3.tone === key}
              className={cn('rounded-md border p-3 text-left transition-colors duration-200 ease-signal', choiceClass(step3.tone === key), isGeneratingAI && 'cursor-not-allowed opacity-50')}>
              <span className={cn('block text-xs font-bold', step3.tone === key ? 'text-accent' : 'text-ink')}>{label}</span>
              <span className="mt-0.5 block text-xs text-quiet">{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* One language per campaign, deduced from the zones unless chosen. */}
      <fieldset className="mb-6">
        <legend className={cn(fieldLabel, 'mb-3')}>
          {t.language}
          {!step3.language && <span className="ml-2 text-accent">{t.languageAuto}</span>}
        </legend>
        <div className="flex gap-2">
          {t.languages.map(({ key, label, desc }) => (
            <button key={key} type="button" onClick={() => !isGeneratingAI && updateStep3({ language: key })} disabled={isGeneratingAI} aria-pressed={effectiveLanguage === key}
              className={cn('flex-1 rounded-md border p-3 text-left transition-colors duration-200 ease-signal', choiceClass(effectiveLanguage === key), isGeneratingAI && 'cursor-not-allowed opacity-50')}>
              <span className={cn('block text-xs font-bold', effectiveLanguage === key ? 'text-accent' : 'text-ink')}>{label}</span>
              <span className="mt-0.5 block text-xs text-quiet">{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mb-8">
        <label htmlFor="value-proposition" className={fieldLabel}>{t.valueProp}<span className="ml-1 text-quiet">{t.valuePropHint}</span></label>
        <textarea id="value-proposition" value={step3.valueProposition} onChange={(e) => !isGeneratingAI && updateStep3({ valueProposition: e.target.value })}
          disabled={isGeneratingAI} placeholder={t.valuePropPh} rows={3} aria-describedby="value-proposition-hint" className={cn(textControl, 'resize-none px-4 py-3')} />
        <p id="value-proposition-hint" className={cn('mt-1.5 text-xs', valuePropReady ? 'text-quiet' : 'text-warning')}>
          {valuePropReady ? t.valuePropReady : t.valuePropMissing(MIN_VALUE_PROP_LENGTH)}
        </p>
      </div>

      {error && (
        <div role="alert" className={cn('mb-6 flex items-start gap-3 rounded-lg border bg-raised px-4 py-3', isPlanError ? 'border-warning/30' : 'border-danger/30')}>
          <AlertCircle className={cn('mt-0.5 h-4 w-4 shrink-0', isPlanError ? 'text-warning' : 'text-danger')} aria-hidden="true" />
          <div className="flex-1">
            <p className={cn('text-xs font-semibold', isPlanError ? 'text-warning' : 'text-danger')}>{isPlanError ? t.proFeature : t.genError}</p>
            <p className="text-xs text-quiet">{isPlanError ? t.proBody : error}</p>
            {isPlanError && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link href={t.goProHref} className={buttonVariants({ size: 'sm', className: 'h-8 px-3 text-xs' })}>{t.goPro}</Link>
                <span className="text-xs text-quiet">{t.orContinue}</span>
              </div>
            )}
            {error.includes('ANTHROPIC_API_KEY') && <p className="mt-1 font-mono text-xs text-quiet">{t.apiKey}</p>}
          </div>
        </div>
      )}

      {step3.emailSteps.length === 0 && !isGeneratingAI && (
        <>
          <PipelineSelector plan={plan} onChange={(next) => updateStep3({ sequencePlan: next })} />
          {plan.some((s) => s.channel === 'linkedin') && <LinkedInPlanHint className="mb-8" />}
          {plan.some((s) => isPhoneChannel(s.channel)) && (
            <p className="mb-8 rounded-lg border border-signal/25 bg-raised px-4 py-3 text-xs leading-relaxed text-quiet">{t.phoneNote}</p>
          )}
          <div className="mb-8 text-center">
            <Button size="lg" onClick={() => void handleGenerate()} disabled={!valuePropReady} className="px-8">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t.generate}
            </Button>
            <p className="mt-3 font-mono text-xs text-quiet">{t.generateNote}</p>
          </div>
          <div className="mb-6">
            <Button variant="outline" onClick={addBlankStep} className="h-12 w-full border-dashed text-xs text-quiet">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.writeYourself}
            </Button>
          </div>
        </>
      )}

      {isGeneratingAI && (
        <div className="mb-6">
          <GenerationStatus status={genStatus} currentEmail={currentEmailIndex} totalEmails={genTotal} />
          <Button variant="ghost" size="sm" onClick={handleStop} className="mt-2 h-8 px-2 text-xs">{t.cancel}</Button>
        </div>
      )}

      {(step3.emailSteps.length > 0 || streamingIndex !== null) && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs tabular-nums text-quiet">{t.messages(step3.emailSteps.length)}</span>
            {!isGeneratingAI && valuePropReady && (
              <Button variant="ghost" size="sm" onClick={() => void handleGenerate()} className="h-8 gap-1.5 px-2 text-xs text-accent hover:text-accent">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {t.regenerate}
              </Button>
            )}
          </div>
          {step3.emailSteps.map((step, i) => (
            <EmailCard key={step.id} step={step} index={i} onDelete={() => updateStep3({ emailSteps: step3.emailSteps.filter((s) => s.id !== step.id) })} onUpdate={(patch) => updateStep(step.id, patch)} />
          ))}
          {streamingIndex !== null && (
            <EmailCard key="streaming" step={{ id: 'streaming', dayOffset: 0, subject: '', body: streamBuffer, isAiGenerated: true }}
              index={step3.emailSteps.length} isStreaming streamText={streamBuffer} onDelete={() => {}} />
          )}
          {step3.emailSteps.length > 0 && !isGeneratingAI && (
            <div className="rounded-lg border border-line bg-raised p-4">
              <SequenceTimeline steps={step3.emailSteps.map((s, i) => ({ id: s.id, position: i, dayOffset: s.dayOffset, subject: s.subject, channel: toDbChannel(s.channel) }))} />
            </div>
          )}
          {!isGeneratingAI && (
            <Button variant="outline" onClick={addBlankStep} className="h-11 w-full border-dashed text-xs text-quiet">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.addYourself}
            </Button>
          )}
        </div>
      )}

      {step3.emailSteps.length > 0 && !isGeneratingAI && incomplete.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-raised px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-xs text-warning">{incomplete.length === 1 ? t.incompleteOne : t.incompleteMany(incomplete.length)}</p>
        </div>
      )}

      {oversized.length > 0 && !isGeneratingAI && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-raised px-3 py-2" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-xs text-danger">
            {oversized.length === 1 ? t.noteTooLongOne(LINKEDIN_LIMITS.INVITE_NOTE_MAX) : t.noteTooLongMany(oversized.length, LINKEDIN_LIMITS.INVITE_NOTE_MAX)}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" size="lg" onClick={prevStep} disabled={isGeneratingAI} className="px-5"><ChevronLeft className="h-4 w-4" aria-hidden="true" />{wizardCopy.previous}</Button>
        <Button size="lg" onClick={nextStep} disabled={!canProceed || isGeneratingAI} className="px-6">{t.next}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>
  )
}
