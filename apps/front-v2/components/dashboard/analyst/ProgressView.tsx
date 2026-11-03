/** The work in progress, step by step: the answer itself arrives verified, at once. */

import { Check, Loader2 } from 'lucide-react'
import { analystCopy } from '@/lib/copy/analyst'
import type { ProgressEvent } from '@/lib/front/types-analyst'
import { cn } from '@/lib/utils'

const t = analystCopy.progress
const STEPS = ['analyse', 'relecture', 'verification'] as const

export function ProgressView({ events }: { events: ProgressEvent[] }) {
  const reached = new Set(events.flatMap((e) => (e.type === 'step' ? [e.step] : [])))
  const tools = events.flatMap((e) => (e.type === 'tool' ? [e.name] : []))
  const current = [...STEPS].reverse().find((s) => reached.has(s)) ?? 'analyse'
  const correcting = reached.has('correction')

  const counts = new Map<string, number>()
  for (const name of tools) counts.set(name, (counts.get(name) ?? 0) + 1)

  return (
    <div className="rounded-lg border border-line bg-raised p-4" role="status" aria-live="polite">
      <ol className="space-y-2.5">
        {STEPS.map((s) => {
          const done = reached.has(s) && s !== current
          const active = s === current
          return (
            <li key={s} className="flex items-center gap-2.5 text-sm">
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', done ? 'border-success/40 bg-success/10' : active ? 'border-accent/50' : 'border-line')}>
                {done ? <Check className="h-3 w-3 text-success" aria-hidden="true" /> : active ? <Loader2 className="h-3 w-3 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" /> : null}
              </span>
              <span className={active ? 'text-ink' : 'text-quiet'}>{t.steps[s]}</span>
            </li>
          )
        })}
      </ol>
      {counts.size > 0 && (
        <p className="mt-3 border-t border-line pt-3 font-mono text-[11px] text-quiet">
          {t.consulted}{[...counts.entries()].map(([name, n]) => `${t.tools[name] ?? name}${n > 1 ? ` ×${n}` : ''}`).join(' · ')}
        </p>
      )}
      {correcting && <p className="mt-2 text-xs text-warning">{t.correcting}</p>}
    </div>
  )
}
