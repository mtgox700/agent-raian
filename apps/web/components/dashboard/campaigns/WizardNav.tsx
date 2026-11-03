'use client'

import { Check } from 'lucide-react'
import { useCampaignWizard, type WizardStepIndex } from '@/lib/hooks/use-campaign-wizard'
import { cn } from '@/lib/utils'

const STEPS: { index: WizardStepIndex; label: string; desc: string }[] = [
  { index: 1, label: 'Identité', desc: 'Nom et objectif' },
  { index: 2, label: 'Ciblage', desc: 'Postes, taille, zone' },
  { index: 3, label: 'Séquence', desc: 'E-mails et ton' },
  { index: 4, label: 'Leads', desc: 'Source et volume' },
  { index: 5, label: 'Lancement', desc: 'Vérification et mise en ligne' },
]

export function WizardNav() {
  const { currentStep, setStep, data } = useCampaignWizard()

  return (
    <aside className="max-md:hidden flex w-64 flex-shrink-0 flex-col border-r border-border bg-obsidian px-5 py-8">
      <div className="mb-8">
        <p className="font-display text-sm font-bold text-white">Nouvelle campagne</p>
        <p className="mt-0.5 font-mono text-xs text-muted">Assistant en 5 étapes</p>
      </div>

      <nav aria-label="Étapes de la campagne">
        <ol className="flex flex-col">
          {STEPS.map(({ index, label, desc }, i) => {
            const isDone = index < currentStep
            const isActive = index === currentStep
            const isLocked = index > currentStep
            const isLast = i === STEPS.length - 1

            return (
              <li key={index} className="relative">
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-[15px] top-9 h-[calc(100%-1.75rem)] w-px',
                      isDone ? 'bg-cyan/50' : 'bg-border',
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => isDone && setStep(index)}
                  disabled={isLocked}
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'relative flex w-full items-start gap-3 rounded-md px-0 py-2 text-left transition-colors duration-150 ease-signal',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian',
                    isDone && 'cursor-pointer hover:text-white',
                    isActive && 'cursor-default',
                    isLocked && 'cursor-not-allowed',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border font-mono text-xs tabular-nums transition-colors duration-150 ease-signal',
                      isActive && 'border-cyan bg-cyan text-void',
                      isDone && 'border-cyan/40 bg-void text-cyan',
                      isLocked && 'border-border bg-void text-muted',
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : String(index).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span
                      className={cn(
                        'block text-sm font-semibold',
                        isActive ? 'text-white' : isDone ? 'text-white/80' : 'text-muted',
                      )}
                    >
                      {label}
                      {isDone && <span className="sr-only"> (terminée)</span>}
                    </span>
                    <span className="block font-mono text-xs text-muted">{desc}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {data.step1.name && (
        <div className="mt-auto rounded-[10px] border border-border bg-void p-3">
          <p className="font-mono text-xs text-muted">Campagne</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{data.step1.name}</p>
          {data.step1.industry && (
            <p className="mt-1 truncate font-mono text-xs text-cyan">{data.step1.industry}</p>
          )}
        </div>
      )}
    </aside>
  )
}
