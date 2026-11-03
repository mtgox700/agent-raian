'use client'

import { WizardNav } from '@/components/dashboard/campaigns/WizardNav'
import { Step1Identity } from '@/components/dashboard/campaigns/Step1Identity'
import { Step2Targeting } from '@/components/dashboard/campaigns/Step2Targeting'
import { Step3Sequence } from '@/components/dashboard/campaigns/Step3Sequence'
import { Step4Leads } from '@/components/dashboard/campaigns/Step4Leads'
import { Step5Launch } from '@/components/dashboard/campaigns/Step5Launch'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export function CampaignWizard() {
  const { currentStep } = useCampaignWizard()

  return (
    <div className="flex h-screen overflow-hidden bg-void">
      {/* Left nav */}
      <WizardNav />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border bg-obsidian px-4 md:px-6">
          <Link
            href="/dashboard/campaigns"
            className="flex items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Retour aux campagnes
          </Link>

          {/* Step counter (visible on mobile, where the side nav is hidden) */}
          <div className="flex items-center gap-1.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-1 w-8 rounded-full transition-colors duration-200 ease-signal ${
                  s < currentStep ? 'bg-cyan/50' : s === currentStep ? 'bg-cyan' : 'bg-border'
                }`}
              />
            ))}
          </div>

          <span className="font-mono text-xs tabular-nums text-muted">
            Étape {String(currentStep).padStart(2, '0')} / 05
          </span>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-auto">
          {/* Keyed plain div + CSS entrance: switching steps never waits on an
              exit animation. With AnimatePresence mode="wait" the previous
              step stayed on screen (or blank) while the state had moved on,
              so a second click advanced twice and a reload mid-wizard showed
              the wrong step. */}
          <div key={currentStep} className="wizard-step-in min-h-full">
              {currentStep === 1 && <Step1Identity />}
              {currentStep === 2 && <Step2Targeting />}
              {currentStep === 3 && <Step3Sequence />}
              {currentStep === 4 && <Step4Leads />}
              {currentStep === 5 && <Step5Launch />}
          </div>
        </div>
      </div>
    </div>
  )
}
