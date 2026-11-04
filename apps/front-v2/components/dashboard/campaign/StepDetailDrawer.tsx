'use client'

/**
 * One sequence step: the full message as it goes to the lead and, while some
 * lead still waits for it, inline editing of the subject, body and delay
 * (campaigns.updateStep, same input as body n°1). Step 1 stays immediate;
 * once every lead received it, it is read-only.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarClock, Check, Clock, Loader2, Lock, Mail, Minus, Pencil, Plus } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Badge, Button } from '@/components/ui'
import { Drawer } from '@/components/dashboard/shared/Drawer'
import { stepDrawerCopy as t } from '@/lib/copy/campaign'
import { api } from '@/lib/front/api'
import type { CampaignStepStats } from '@/lib/front/types-campaigns'

const VARIABLES = ['{{firstName}}', '{{lastName}}', '{{company}}', '{{title}}', '{{industry}}']

type StepEditor = ReturnType<typeof useStepEditor>

function useStepEditor(step: CampaignStepStats | null) {
  const router = useRouter()
  const [forId, setForId] = useState<string | null>(step?.stepId ?? null)
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(step?.subject ?? '')
  const [body, setBody] = useState(step?.body ?? '')
  const [day, setDay] = useState(step?.dayOffset ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A new step (or a close) starts from the stored version.
  const id = step?.stepId ?? null
  if (id !== forId) {
    setForId(id)
    setEditing(false)
    setSubject(step?.subject ?? '')
    setBody(step?.body ?? '')
    setDay(step?.dayOffset ?? 0)
    setError(null)
  }

  const canDelay = (step?.position ?? 0) > 0
  const dirty = step !== null && (subject !== step.subject || body !== step.body || day !== step.dayOffset)
  const insertVar = (v: string) => setBody((b) => `${b}${b.endsWith(' ') || b.length === 0 ? '' : ' '}${v} `)

  const save = async () => {
    if (!step) return
    setSaving(true); setError(null)
    try {
      await api.call('campaigns.updateStep', {
        params: { stepId: step.stepId },
        body: { subject: subject.trim(), body: body.trim(), dayOffset: canDelay ? day : undefined },
      })
      setSaving(false)
      setEditing(false)
      router.refresh()
    } catch (err) {
      setSaving(false)
      setError(err instanceof ApiError ? err.message : t.failed)
    }
  }

  const cancel = () => {
    if (!step) return
    setSubject(step.subject); setBody(step.body); setDay(step.dayOffset)
    setError(null); setEditing(false)
  }

  return { editing, setEditing, subject, setSubject, body, setBody, day, setDay, saving, error, dirty, canDelay, insertVar, save, cancel }
}

export function StepDetailDrawer({ step, onClose }: { step: CampaignStepStats | null; onClose: () => void }) {
  const editor = useStepEditor(step)
  return (
    <Drawer
      open={step !== null}
      onClose={() => { if (!editor.saving) onClose() }}
      size="lg"
      closeLabel={t.close}
      title={step ? t.title(step.position + 1) : ''}
      description={step ? <StepMeta step={step} day={editor.editing ? editor.day : step.dayOffset} /> : undefined}
      footer={step ? <StepFooter step={step} editor={editor} /> : undefined}
    >
      {step && <StepBody step={step} editor={editor} />}
    </Drawer>
  )
}

function StepMeta({ step, day }: { step: CampaignStepStats; day: number }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{step.position === 0 ? t.immediate : `J+${day}`}</span>
      <span className="inline-flex items-center gap-1 tabular-nums"><Mail className="h-3 w-3" aria-hidden="true" />{t.sentN(step.totalSent)}</span>
      {step.totalSent > 0 ? <Badge tone="success">{t.sentBadge}</Badge> : <Badge tone="accent">{t.upcoming}</Badge>}
    </span>
  )
}

function StepBody({ step, editor }: { step: CampaignStepStats; editor: StepEditor }) {
  const { editing, canDelay, day, setDay, subject, setSubject, body, setBody, insertVar, error } = editor
  const subjectId = `step-subject-${step.stepId}`

  return (
    <>
      {editing && canDelay && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-line p-3">
          <CalendarClock className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-mono text-xs text-quiet">{t.sendAfter}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 w-8 px-0" aria-label={t.dayLess} onClick={() => setDay((d) => Math.max(1, d - 1))}>
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <span className="w-16 text-center font-mono text-sm font-semibold tabular-nums text-ink" aria-live="polite">J+{day}</span>
              <Button type="button" variant="outline" size="sm" className="h-8 w-8 px-0" aria-label={t.dayMore} onClick={() => setDay((d) => Math.min(60, d + 1))}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <span className="ml-1 text-xs text-quiet">{t.daysAfter(day)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-canvas">
        <dl className="space-y-1 border-b border-line px-4 py-3 text-xs">
          <div className="flex gap-2"><dt className="w-12 font-mono text-quiet">{t.from}</dt><dd className="text-ink/70">{t.fromValue}</dd></div>
          <div className="flex gap-2"><dt className="w-12 font-mono text-quiet">{t.to}</dt><dd className="font-mono text-ink/70">{'{{firstName}} {{lastName}}'}</dd></div>
          <div className="flex items-center gap-2">
            <dt className="w-12 shrink-0 font-mono text-quiet">{editing ? <label htmlFor={subjectId}>{t.subject}</label> : t.subject}</dt>
            <dd className="min-w-0 flex-1">
              {editing ? (
                <input
                  id={subjectId}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  placeholder={t.subjectPlaceholder}
                  className="w-full rounded-md border border-line bg-raised px-2 py-1 text-sm font-semibold text-ink outline-none focus:border-accent/60"
                />
              ) : <span className="font-semibold text-ink">{step.subject}</span>}
            </dd>
          </div>
        </dl>
        <div className="px-4 py-4">
          {editing ? (
            <>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                aria-label={t.bodyLabel}
                placeholder={t.bodyPlaceholder}
                className="w-full resize-none rounded-md bg-transparent font-sans text-sm leading-relaxed text-ink/90 outline-none placeholder:text-quiet"
              />
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                <span className="font-mono text-xs text-quiet">{t.variables}</span>
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(v)}
                    className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-quiet transition-colors duration-200 ease-signal hover:border-accent/40 hover:text-accent"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </>
          ) : <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/90">{step.body}</pre>}
        </div>
      </div>

      {editing && step.totalSent > 0 && (
        <p className="mt-3 rounded-md border border-signal/25 px-3 py-2 text-xs leading-relaxed text-signal">{t.alreadySent(step.totalSent, step.queued)}</p>
      )}
      {!editing && (
        <p className="mt-3 text-xs leading-relaxed text-quiet">
          {t.varsNoteBefore}<span className="font-mono text-ink/70">{'{{firstName}}'}</span>{t.varsNoteAfter}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </>
  )
}

function StepFooter({ step, editor }: { step: CampaignStepStats; editor: StepEditor }) {
  // Queued sends read the step when they leave: an edit reaches every lead still waiting.
  const editable = step.totalSent === 0 || step.queued > 0
  const { editing, saving, dirty, subject, body, save, cancel, setEditing } = editor

  if (!editable) {
    return <p className="mr-auto flex items-center gap-1.5 text-xs text-quiet"><Lock className="h-3 w-3" aria-hidden="true" /> {t.locked}</p>
  }
  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {t.edit}
      </Button>
    )
  }
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={saving}>{t.cancel}</Button>
      <Button
        type="button"
        size="sm"
        onClick={() => void save()}
        disabled={saving || !dirty || subject.trim().length === 0 || body.trim().length === 0}
        aria-busy={saving}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        {saving ? t.saving : t.save}
      </Button>
    </>
  )
}
