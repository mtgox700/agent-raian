'use client'

/** Per sequence step: leads reached, those who did not get the next step, and the reply rate with its interval. */

import { Linkedin, Mail, MessageCircle } from 'lucide-react'
import type { StepPoint } from '@/lib/analytics/build'
import { ci, nf, pct } from './ChartFrame'

const CHANNEL: Record<string, { label: string; Icon: typeof Mail }> = {
  EMAIL: { label: 'E-mail', Icon: Mail },
  LINKEDIN: { label: 'LinkedIn', Icon: Linkedin },
}

export function StepFunnel({ steps }: { steps: StepPoint[] }) {
  const top = Math.max(1, ...steps.map((s) => s.reached))
  return (
    <ol className="space-y-3">
      {steps.map((s) => {
        const ch = CHANNEL[s.channel] ?? { label: s.channel === 'MIXTE' ? 'Canaux mixtes' : s.channel, Icon: MessageCircle }
        return (
          <li key={s.position}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <ch.Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" /> Étape {s.position} · {ch.label}
              </span>
              <span className="tabular-nums text-muted">
                {s.pending ? 'pas encore envoyée' : <>{nf(s.reached)} leads · réponse <span className="font-semibold text-white">{pct(s.replyRate)}</span> (IC {ci(s.replyRate)})</>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]" role="img" aria-label={`Étape ${s.position} : ${nf(s.reached)} leads atteints`}>
              <div className="h-full rounded-full bg-cyan/70" style={{ width: `${(s.reached / top) * 100}%` }} />
            </div>
            {s.dropped !== null && s.dropped > 0 && (
              <p className="mt-1 text-[11px] text-muted">{nf(s.dropped)} n’ont pas reçu l’étape suivante (réponse, arrêt de la séquence ou pas encore l’heure)</p>
            )}
            {s.bounced > 0 && <p className="mt-0.5 text-[11px] text-warning">{nf(s.bounced)} rebond{s.bounced > 1 ? 's' : ''} à cette étape</p>}
          </li>
        )
      })}
    </ol>
  )
}
