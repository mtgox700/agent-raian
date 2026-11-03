'use client'

import type { FunnelStep } from '@/lib/repositories/campaigns.repository'

interface FunnelWidgetProps {
  steps: FunnelStep[]
}

/**
 * Tones by step: reaching and delivering is the machine (cyan), a reply and
 * what follows is a human (gold). The repository colours are not used: they
 * predate the palette.
 */
const TONE: Record<string, { bar: string; text: string }> = {
  'Contactés':        { bar: 'bg-cyan/60', text: 'text-cyan' },
  'Sans rebond':      { bar: 'bg-cyan/60', text: 'text-cyan' },
  'Ont répondu':      { bar: 'bg-gold/60', text: 'text-gold' },
  'Réponse positive': { bar: 'bg-gold/60', text: 'text-gold' },
  'Qualifiés':        { bar: 'bg-gold/60', text: 'text-gold' },
}
const NEUTRAL = { bar: 'bg-muted/50', text: 'text-white' }

export function FunnelWidget({ steps }: FunnelWidgetProps) {
  return (
    <div className="rounded-[10px] border border-border bg-obsidian p-5">
      <p className="mb-4 font-mono text-xs font-medium text-white">
        Entonnoir de conversion
        <span className="ml-2 font-normal text-muted">leads, depuis le début</span>
      </p>
      <div className="flex items-start gap-2">
        {steps.map((step) => {
          const tone = TONE[step.label] ?? NEUTRAL
          return (
            <div key={step.label} className="flex flex-1 flex-col items-center gap-2">
              {/* Bar: grows to its share once on mount (transform only, globals.css .ui-grow-y). */}
              <div className="relative w-full overflow-hidden rounded-t-md bg-surface" style={{ height: 80 }}>
                <div
                  style={{ height: `${Math.max(step.percentage, 2)}%` }}
                  className={`ui-grow-y absolute bottom-0 w-full rounded-t-md ${tone.bar}`}
                />
                <div className={`absolute bottom-1 w-full text-center font-mono text-[11px] font-semibold tabular-nums ${tone.text}`}>
                  {step.count.toLocaleString('fr-FR')}
                </div>
              </div>
              {/* Two lines reserved: a label that wraps does not shift its bar. */}
              <div className="min-h-[2.5rem] text-center leading-tight">
                <p className="text-[11px] font-medium text-muted">{step.label}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">{step.percentage.toLocaleString('fr-FR')}{'\u00a0'}%</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
