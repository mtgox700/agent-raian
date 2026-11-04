/**
 * Vertical trace of a sequence: a 1 px rail, one node per step (number,
 * delay, channel, subject or channel label). Used by the wizard (step 3) and
 * the campaign page. No entrance animation: the steps are content.
 */
import { Linkedin, Mail, MessageCircle, Smartphone } from 'lucide-react'
import { timelineCopy as t } from '@/lib/copy/campaign'
import type { StepChannelKey } from '@/lib/front/types-campaigns'
import { cn } from '@/lib/utils'

export interface TimelineStep {
  id: string
  position: number
  dayOffset: number
  subject: string
  channel?: StepChannelKey
}

const ICON: Record<StepChannelKey, typeof Mail> = { EMAIL: Mail, LINKEDIN: Linkedin, WHATSAPP: MessageCircle, SMS: Smartphone }

function stepLabel(step: TimelineStep): string {
  if (step.channel === 'LINKEDIN') return t.linkedin
  if (step.channel === 'WHATSAPP') return t.whatsapp
  if (step.channel === 'SMS') return t.sms
  return step.subject || '…'
}

export function SequenceTimeline({ steps, activeIndex, className }: { steps: TimelineStep[]; activeIndex?: number; className?: string }) {
  if (steps.length === 0) return null
  const count = (c: StepChannelKey) => steps.filter((s) => (s.channel ?? 'EMAIL') === c).length
  const last = steps[steps.length - 1]

  return (
    <div className={cn('w-full', className)}>
      <p className="mb-3 font-mono text-xs text-quiet">{t.title}</p>
      <ol className="relative">
        {steps.map((step, i) => {
          const channel = step.channel ?? 'EMAIL'
          const Icon = ICON[channel]
          const active = activeIndex === i
          const label = stepLabel(step)
          return (
            <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0" aria-current={active ? 'step' : undefined}>
              {i < steps.length - 1 && <span className="absolute bottom-0 left-[11px] top-6 w-px bg-line" aria-hidden="true" />}
              <span className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-raised font-mono text-xs font-semibold tabular-nums',
                active ? 'border-accent text-accent' : 'border-line text-quiet',
              )}>
                {step.position + 1}
              </span>
              <div className="flex min-w-0 flex-1 items-start gap-2 pt-0.5">
                <span className="w-[86px] shrink-0 font-mono text-xs tabular-nums text-quiet">
                  {step.dayOffset === 0 ? t.immediate : `J+${step.dayOffset}`}
                </span>
                <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', active ? 'text-accent' : 'text-quiet')} aria-hidden="true" />
                <span className="sr-only">{t.channelName[channel]} : </span>
                <p className={cn('line-clamp-2 min-w-0 text-xs leading-snug', active ? 'text-ink' : 'text-ink/70')} title={label}>{label}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 border-t border-line pt-3 font-mono text-xs tabular-nums text-quiet">
        {t.summary(count('EMAIL'), count('LINKEDIN'), count('WHATSAPP'), count('SMS'), steps.length)} ·{' '}
        {t.duration}{' '}
        {last.dayOffset === 0 ? t.immediateTotal : t.days(last.dayOffset)}
      </p>
    </div>
  )
}
