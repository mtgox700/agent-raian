'use client'

import { Check } from 'lucide-react'
import { wizardCopy as t } from '@/lib/copy/campaign-wizard'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { cn } from '@/lib/utils'

/** The five steps as a sequence rail: done steps can be revisited, later ones are locked. */
export function WizardNav() {
  const { currentStep, setStep, data } = useCampaignWizard()
  return (
    <aside className="flex w-60 shrink-0 flex-col max-lg:hidden">
      <nav aria-label={t.navLabel}>
        <ol className="flex flex-col">
          {t.steps.map(({ index, label, desc }, i) => {
            const isDone = index < currentStep
            const isActive = index === currentStep
            const isLocked = index > currentStep
            return (
              <li key={index} className="relative">
                {i < t.steps.length - 1 && (
                  <span aria-hidden="true" className={cn('absolute left-[15px] top-9 h-[calc(100%-1.75rem)] w-px', isDone ? 'bg-accent/50' : 'bg-line')} />
                )}
                <button
                  type="button"
                  onClick={() => isDone && setStep(index)}
                  disabled={isLocked}
                  aria-current={isActive ? 'step' : undefined}
                  className={cn('relative flex w-full items-start gap-3 rounded-md py-2 text-left transition-colors duration-200 ease-signal',
                    isDone && 'cursor-pointer hover:text-ink', isActive && 'cursor-default', isLocked && 'cursor-not-allowed')}
                >
                  <span aria-hidden="true" className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-xs tabular-nums transition-colors duration-200 ease-signal',
                    isActive && 'border-accent bg-accent text-canvas',
                    isDone && 'border-accent/40 bg-canvas text-accent',
                    isLocked && 'border-line bg-canvas text-quiet',
                  )}>
                    {isDone ? <Check className="h-3.5 w-3.5" /> : String(index).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className={cn('block text-sm font-semibold', isActive ? 'text-ink' : isDone ? 'text-ink/80' : 'text-quiet')}>
                      {label}
                      {isDone && <span className="sr-only">{t.done}</span>}
                    </span>
                    <span className="block font-mono text-xs text-quiet">{desc}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      {data.step1.name && (
        <div className="mt-8 rounded-lg border border-line bg-raised p-3">
          <p className="font-mono text-xs text-quiet">{t.campaign}</p>
          <p className="mt-1 truncate text-sm font-semibold text-ink">{data.step1.name}</p>
          {data.step1.industry && <p className="mt-1 truncate font-mono text-xs text-accent">{data.step1.industry}</p>}
        </div>
      )}
    </aside>
  )
}
