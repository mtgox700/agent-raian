'use client'

/**
 * The campaign wizard: the step rail on the left, the current step on the
 * right, the step counter on top. State in the persisted zustand store
 * (lib/hooks/use-campaign-wizard), as in body n°1: a reload keeps the draft.
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Step1Identity } from '@/components/dashboard/campaign-wizard/Step1Identity'
import { Step2Targeting } from '@/components/dashboard/campaign-wizard/Step2Targeting'
import { Step3Sequence } from '@/components/dashboard/campaign-wizard/Step3Sequence'
import { Step4Leads } from '@/components/dashboard/campaign-wizard/Step4Leads'
import { Step5Launch } from '@/components/dashboard/campaign-wizard/Step5Launch'
import { WizardNav } from '@/components/dashboard/campaign-wizard/WizardNav'
import { wizardCopy as t } from '@/lib/copy/campaign-wizard'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { cn } from '@/lib/utils'

export function CampaignWizard() {
  const { currentStep } = useCampaignWizard()
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <Link href={t.backHref} className="flex items-center gap-2 text-xs font-medium text-quiet transition-colors duration-200 ease-signal hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t.back}
        </Link>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={cn('h-1 w-6 rounded-full transition-colors duration-200 ease-signal sm:w-8', n < currentStep ? 'bg-accent/50' : n === currentStep ? 'bg-accent' : 'bg-line')} />
          ))}
        </div>
        <span className="font-mono text-xs tabular-nums text-quiet">{t.counter(currentStep)}</span>
      </div>
      <div className="flex gap-10">
        <WizardNav />
        {/* Keyed: switching steps never waits on an exit animation. */}
        <div key={currentStep} className="min-w-0 flex-1 pb-8">
          {currentStep === 1 && <Step1Identity />}
          {currentStep === 2 && <Step2Targeting />}
          {currentStep === 3 && <Step3Sequence />}
          {currentStep === 4 && <Step4Leads />}
          {currentStep === 5 && <Step5Launch />}
        </div>
      </div>
    </div>
  )
}
