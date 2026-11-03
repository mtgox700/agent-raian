'use client'

/**
 * SequenceTimeline
 *
 * Vertical instrument trace of a sequence: a 1 px rail, one node per step
 * (mono step number, delay, channel icon, subject or channel label).
 *
 *   1  J+0  [mail]      Objet du premier e-mail
 *   |
 *   2  J+3  [linkedin]  Message LinkedIn
 *
 * Used in:
 *  - Campaign wizard Step3 (live preview as steps are generated)
 *  - Campaign detail page (static read-only)
 *
 * No entrance animation: the steps are content, not a show.
 */

import type { StepChannelDb } from '@/lib/types/channels'
import { Mail, Linkedin, MessageCircle, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

function stepLabel(step: { channel?: StepChannelDb; subject: string }): string {
  if (step.channel === 'LINKEDIN') return 'Message LinkedIn'
  if (step.channel === 'WHATSAPP') return 'WhatsApp · depuis votre téléphone'
  if (step.channel === 'SMS') return 'SMS · depuis votre téléphone'
  return step.subject || '…'
}

const CHANNEL_ICON: Record<StepChannelDb, typeof Mail> = {
  EMAIL: Mail,
  LINKEDIN: Linkedin,
  WHATSAPP: MessageCircle,
  SMS: Smartphone,
}

const CHANNEL_NAME: Record<StepChannelDb, string> = {
  EMAIL: 'E-mail',
  LINKEDIN: 'LinkedIn',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
}

export interface TimelineStep {
  id:        string
  position:  number
  dayOffset: number
  subject:   string
  /** Step channel: LinkedIn nodes get the LinkedIn icon + label. */
  channel?:  StepChannelDb
}

interface SequenceTimelineProps {
  steps:    TimelineStep[]
  /** If provided, highlights the step at this index as "active / in progress" */
  activeIndex?: number
  className?: string
}

// ─── Single node ──────────────────────────────────────────────────────────────

function TimelineNode({
  step,
  isActive,
  isLast,
}: {
  step:     TimelineStep
  isActive: boolean
  isLast:   boolean
}) {
  const channel = step.channel ?? 'EMAIL'
  const Icon = CHANNEL_ICON[channel]
  const label = stepLabel(step)

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0" aria-current={isActive ? 'step' : undefined}>
      {/* Rail: 1 px, from this node down to the next */}
      {!isLast && <span className="absolute bottom-0 left-[11px] top-6 w-px bg-border" aria-hidden="true" />}

      <span
        className={cn(
          'relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border bg-obsidian font-mono text-xs font-semibold tabular-nums',
          isActive ? 'border-cyan text-cyan' : 'border-border text-muted',
        )}
      >
        {step.position + 1}
      </span>

      <div className="flex min-w-0 flex-1 items-start gap-2 pt-0.5">
        <span className="w-[86px] flex-shrink-0 font-mono text-xs tabular-nums text-muted">
          {step.dayOffset === 0 ? 'Envoi immédiat' : `J+${step.dayOffset}`}
        </span>
        <Icon className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', isActive ? 'text-cyan' : 'text-muted')} aria-hidden="true" />
        <span className="sr-only">{CHANNEL_NAME[channel]} : </span>
        <p
          className={cn('line-clamp-2 min-w-0 text-xs leading-snug', isActive ? 'text-white' : 'text-white/70')}
          title={label}
        >
          {label}
        </p>
      </div>
    </li>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SequenceTimeline({
  steps,
  activeIndex,
  className,
}: SequenceTimelineProps) {
  if (steps.length === 0) return null

  return (
    <div className={cn('w-full', className)}>
      <p className="mb-3 font-mono text-xs text-muted">
        Aperçu de la séquence
      </p>

      <ol className="relative">
        {steps.map((step, i) => (
          <TimelineNode
            key={step.id}
            step={step}
            isActive={activeIndex === i}
            isLast={i === steps.length - 1}
          />
        ))}
      </ol>

      {/* Step count summary, channel-precise */}
      <p className="mt-3 border-t border-border pt-3 font-mono text-xs tabular-nums text-muted">
        {(() => {
          const count = (c: string) => steps.filter((s) => (s.channel ?? 'EMAIL') === c).length
          const emails = count('EMAIL'), dms = count('LINKEDIN'), wa = count('WHATSAPP'), sms = count('SMS')
          const parts: string[] = []
          if (emails > 0) parts.push(`${emails} e-mail${emails > 1 ? 's' : ''}`)
          if (dms > 0) parts.push(`${dms} message${dms > 1 ? 's' : ''} LinkedIn`)
          if (wa > 0) parts.push(`${wa} WhatsApp`)
          if (sms > 0) parts.push(`${sms} SMS`)
          return parts.join(' + ') || `${steps.length} étapes`
        })()} ·{' '}
        durée totale{' '}
        {steps.length > 0
          ? steps[steps.length - 1].dayOffset === 0
            ? 'immédiate'
            : `${steps[steps.length - 1].dayOffset} jours`
          : '-'}
      </p>
    </div>
  )
}
