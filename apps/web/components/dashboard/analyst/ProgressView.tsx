'use client'

/** The work in progress, step by step: the answer itself arrives verified, at once. */

import { Check, Loader2 } from 'lucide-react'
import type { ProgressEvent } from './types'

const STEPS = [
  { key: 'analyse', label: 'Lecture de vos campagnes' },
  { key: 'relecture', label: 'Relecture critique' },
  { key: 'verification', label: 'Vérification de chaque chiffre' },
] as const

const TOOL_LABELS: Record<string, string> = {
  list_campaigns: 'liste des campagnes',
  campaign_facts: 'faits d’une campagne',
  diagnose_campaign: 'diagnostic',
  compare_campaigns: 'comparaison statistique',
  segment_breakdown: 'réponses par segment',
  message_excerpt: 'lecture du message',
}

export function ProgressView({ events }: { events: ProgressEvent[] }) {
  const reached = new Set(events.filter((e) => e.type === 'step').map((e) => (e as { step: string }).step))
  const tools = events.filter((e): e is { type: 'tool'; name: string } => e.type === 'tool')
  const current = [...STEPS].reverse().find((s) => reached.has(s.key))?.key ?? 'analyse'
  const correcting = reached.has('correction')

  const counts = new Map<string, number>()
  for (const t of tools) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)

  return (
    <div className="rounded-[10px] border border-border bg-obsidian p-4" role="status" aria-live="polite">
      <ol className="space-y-2.5">
        {STEPS.map((s) => {
          const done = reached.has(s.key) && s.key !== current
          const active = s.key === current
          return (
            <li key={s.key} className="flex items-center gap-2.5 text-sm">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${done ? 'border-success-fg/40 bg-success-fg/10' : active ? 'border-cyan/40' : 'border-border'}`}>
                {done ? <Check className="h-3 w-3 text-success-fg" aria-hidden="true" /> : active ? <Loader2 className="h-3 w-3 animate-spin text-cyan" aria-hidden="true" /> : null}
              </span>
              <span className={done ? 'text-muted' : active ? 'text-white' : 'text-muted'}>{s.label}</span>
            </li>
          )
        })}
      </ol>
      {counts.size > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
          Consulté : {[...counts.entries()].map(([name, n]) => `${TOOL_LABELS[name] ?? name}${n > 1 ? ` ×${n}` : ''}`).join(' · ')}
        </p>
      )}
      {correcting && <p className="mt-2 text-xs text-warning">Correction d’une affirmation trop forte ou d’un chiffre à re-sourcer…</p>}
    </div>
  )
}
