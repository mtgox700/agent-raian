/** Per sequence step: leads reached, those who did not get the next step, and the reply rate with its interval. */

import { Linkedin, Mail, MessageCircle } from 'lucide-react'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { StepPoint } from '@/lib/front/types-analytics'
import { ci, nf, pct } from './format'

const t = analyticsCopy.steps
const ICON: Record<string, typeof Mail> = { EMAIL: Mail, LINKEDIN: Linkedin }

export function StepFunnel({ steps }: { steps: StepPoint[] }) {
  const top = Math.max(1, ...steps.map((s) => s.reached))
  return (
    <ol className="space-y-3">
      {steps.map((s) => {
        const Icon = ICON[s.channel] ?? MessageCircle
        const label = s.channel === 'EMAIL' || s.channel === 'LINKEDIN'
          ? analyticsCopy.channels.label[s.channel]
          : s.channel === 'MIXTE' ? t.mixed : s.channel
        return (
          <li key={s.position}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <Icon className="h-3.5 w-3.5 text-quiet" aria-hidden="true" /> {t.step(s.position, label)}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-quiet">
                {s.pending ? t.pending : <>{nf(s.reached)} {t.reply} <span className="font-semibold text-ink">{pct(s.replyRate)}</span> ({analyticsCopy.common.ci(ci(s.replyRate))})</>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={t.reachedLabel(s.position, nf(s.reached))}>
              <div className="h-full rounded-full bg-accent/70" style={{ width: `${(s.reached / top) * 100}%` }} />
            </div>
            {s.dropped !== null && s.dropped > 0 && <p className="mt-1 text-[11px] text-quiet">{t.dropped(nf(s.dropped))}</p>}
            {s.bounced > 0 && <p className="mt-0.5 text-[11px] text-warning">{t.bounced(s.bounced, nf(s.bounced))}</p>}
          </li>
        )
      })}
    </ol>
  )
}
