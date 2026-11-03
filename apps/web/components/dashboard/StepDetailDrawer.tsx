'use client'

/**
 * StepDetailDrawer: side panel for a single sequence step.
 *
 *  • Shows the FULL email (subject + body) exactly as it goes to the lead, in an
 *    email-client-style preview.
 *  • While some lead still waits for the step (never sent, or sends queued):
 *    inline editing of the subject, body (+ variable chips) and the send delay
 *    (J+x); the change reaches the leads not contacted yet. Step 1 stays
 *    immediate.
 *  • Once every lead received it: read-only (you can't un-send an email).
 *
 * Built on the shared native <dialog> drawer: Escape, focus trap and focus
 * return come from the browser. The dialog stays mounted so it can close
 * cleanly; the editor state resets whenever the step changes.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mail, Pencil, Check, Clock, Lock, Loader2, AlertCircle, CalendarClock, Minus, Plus,
} from 'lucide-react'
import { ApiError, createClient } from '@phantera/sdk'
import type { StepStats } from '@/lib/services/campaign-stats.service'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

const api = createClient()

const VARIABLES = ['{{firstName}}', '{{lastName}}', '{{company}}', '{{title}}', '{{industry}}']

interface StepDetailDrawerProps {
  step: StepStats | null
  onClose: () => void
}

export function StepDetailDrawer({ step, onClose }: StepDetailDrawerProps) {
  const editor = useStepEditor(step)

  return (
    <Dialog
      open={step !== null}
      onClose={onClose}
      variant="drawer"
      size="lg"
      busy={editor.saving}
      title={step ? `Étape ${step.position + 1}` : ''}
      description={step ? <StepMeta step={step} day={editor.editing ? editor.day : step.dayOffset} /> : undefined}
      footer={step ? <StepFooter step={step} editor={editor} /> : undefined}
    >
      {step && <StepBody step={step} editor={editor} />}
    </Dialog>
  )
}

// ─── Editor state ─────────────────────────────────────────────────────────────

type StepEditor = ReturnType<typeof useStepEditor>

function useStepEditor(step: StepStats | null) {
  const router = useRouter()
  const [forId,   setForId]   = useState<string | null>(step?.stepId ?? null)
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(step?.subject ?? '')
  const [body,    setBody]    = useState(step?.body ?? '')
  const [day,     setDay]     = useState(step?.dayOffset ?? 0)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // A new step (or a close) starts from the stored version, as a remount did.
  const id = step?.stepId ?? null
  if (id !== forId) {
    setForId(id)
    setEditing(false)
    setSubject(step?.subject ?? '')
    setBody(step?.body ?? '')
    setDay(step?.dayOffset ?? 0)
    setError(null)
  }

  const canDelay = (step?.position ?? 0) > 0           // step 1 is always immediate
  const dirty = step !== null && (subject !== step.subject || body !== step.body || day !== step.dayOffset)

  const insertVar = (v: string) => setBody((b) => `${b}${b.endsWith(' ') || b.length === 0 ? '' : ' '}${v} `)

  const save = async () => {
    if (!step) return
    setSaving(true); setError(null)
    try {
      await api.call('campaigns.updateStep', {
        params: { stepId: step.stepId },
        body: {
          subject:   subject.trim(),
          body:      body.trim(),
          dayOffset: canDelay ? day : undefined,
        },
      })
      setSaving(false)
      setEditing(false); router.refresh()
    } catch (err) {
      setSaving(false)
      setError(err instanceof ApiError ? err.message : 'Échec de la mise à jour')
    }
  }

  const cancel = () => {
    if (!step) return
    setSubject(step.subject); setBody(step.body); setDay(step.dayOffset)
    setError(null); setEditing(false)
  }

  return {
    editing, setEditing, subject, setSubject, body, setBody, day, setDay,
    saving, error, dirty, canDelay, insertVar, save, cancel,
  }
}

// ─── Header line ──────────────────────────────────────────────────────────────

function StepMeta({ step, day }: { step: StepStats; day: number }) {
  const sent = step.totalSent > 0
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {step.position === 0 ? 'Envoi immédiat' : `J+${day}`}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Mail className="h-3 w-3" aria-hidden="true" />
        {step.totalSent} envoyé{step.totalSent > 1 ? 's' : ''}
      </span>
      {sent
        ? <StatusBadge tone="success">Envoyé</StatusBadge>
        : <StatusBadge tone="signal">À venir</StatusBadge>}
    </span>
  )
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function StepBody({ step, editor }: { step: StepStats; editor: StepEditor }) {
  const sent = step.totalSent > 0
  const { editing, canDelay, day, setDay, subject, setSubject, body, setBody, insertVar, error } = editor

  return (
    <>
      {editing && canDelay && (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-border p-3">
          <CalendarClock className="h-4 w-4 flex-shrink-0 text-cyan" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-mono text-xs text-muted">Envoyer après</p>
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="secondary" size="icon" className="h-8 w-8" aria-label="Un jour de moins" onClick={() => setDay((d) => Math.max(1, d - 1))}>
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <span className="w-16 text-center font-mono text-sm font-semibold tabular-nums text-white" aria-live="polite">J+{day}</span>
              <Button type="button" variant="secondary" size="icon" className="h-8 w-8" aria-label="Un jour de plus" onClick={() => setDay((d) => Math.min(60, d + 1))}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <span className="ml-1 text-xs text-muted">jour{day > 1 ? 's' : ''} après le premier e-mail</span>
            </div>
          </div>
        </div>
      )}

      {/* Email preview card (email-client style) */}
      <div className="overflow-hidden rounded-[10px] border border-border bg-void">
        <dl className="space-y-1 border-b border-border px-4 py-3 text-xs">
          <div className="flex gap-2"><dt className="w-12 font-mono text-muted">De</dt><dd className="text-white/70">votre boîte connectée</dd></div>
          <div className="flex gap-2"><dt className="w-12 font-mono text-muted">À</dt><dd className="font-mono text-white/70">{'{{firstName}} {{lastName}}'}</dd></div>
          <div className="flex items-center gap-2">
            <dt className="w-12 flex-shrink-0 font-mono text-muted">
              {editing ? <label htmlFor={`step-subject-${step.stepId}`}>Objet</label> : 'Objet'}
            </dt>
            <dd className="min-w-0 flex-1">
              {editing ? (
                <input
                  id={`step-subject-${step.stepId}`}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-md border border-border bg-obsidian px-2 py-1 text-sm font-semibold text-white outline-none focus:border-cyan/60 focus-visible:ring-2 focus-visible:ring-cyan/40"
                  placeholder="Objet de l'e-mail…"
                />
              ) : (
                <span className="font-semibold text-white">{step.subject}</span>
              )}
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
                aria-label="Corps de l'e-mail"
                className="w-full resize-none rounded-md bg-transparent font-sans text-sm leading-relaxed text-white/90 outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-cyan/40"
                placeholder="Corps de l'e-mail…"
              />
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                <span className="font-mono text-xs text-muted">Variables :</span>
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(v)}
                    className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted transition-colors duration-150 ease-signal hover:border-cyan/40 hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/90">{step.body}</pre>
          )}
        </div>
      </div>

      {editing && sent && (
        <p className="mt-3 rounded-md border border-gold/25 px-3 py-2 text-xs leading-relaxed text-gold">
          Déjà envoyé à {step.totalSent} lead{step.totalSent > 1 ? 's' : ''} : cette version partira aux {step.queued} lead{step.queued > 1 ? 's' : ''} encore en attente.
        </p>
      )}

      {!editing && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Les variables comme <span className="font-mono text-white/70">{'{{firstName}}'}</span> sont automatiquement remplacées par les données de chaque lead à l&apos;envoi.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function StepFooter({ step, editor }: { step: StepStats; editor: StepEditor }) {
  const sent     = step.totalSent > 0
  // Queued sends read the step when they leave: an edit reaches every lead
  // still waiting. Locked only once nobody is left to receive it.
  const editable = !sent || step.queued > 0
  const { editing, saving, dirty, subject, body, save, cancel, setEditing } = editor

  if (!editable) {
    return (
      <p className="mr-auto flex items-center gap-1.5 text-xs text-muted">
        <Lock className="h-3 w-3" aria-hidden="true" /> E-mail envoyé à tous les leads : non modifiable
      </p>
    )
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        Modifier cet e-mail
      </Button>
    )
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={saving}>
        Annuler
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={saving || !dirty || subject.trim().length === 0 || body.trim().length === 0}
        aria-busy={saving}
      >
        {saving
          ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <Check className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </>
  )
}
