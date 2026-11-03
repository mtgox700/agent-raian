'use client'

import { useState } from 'react'
import { CalendarCheck, ChevronRight, Coins, Radio, Target, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui'
import { ExpressCampaign } from '@/components/dashboard/campaign-wizard/ExpressCampaign'
import { ProductIcpAdvisor } from '@/components/dashboard/campaign-wizard/ProductIcpAdvisor'
import { SearchableMultiSelect } from '@/components/dashboard/campaign-wizard/SearchableMultiSelect'
import { StepHeader, choiceClass, fieldLabel, textControl } from '@/components/dashboard/campaign-wizard/StepHeader'
import { step1Copy as t } from '@/lib/copy/campaign-wizard'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { CAMPAIGN_GOALS, INDUSTRIES, type GoalIcon } from '@/lib/types/campaign-wizard'
import { cn } from '@/lib/utils'

const GOAL_ICON: Record<GoalIcon, LucideIcon> = { target: Target, calendar: CalendarCheck, coins: Coins, radio: Radio }

/** Step 1: express campaign from a URL, or name, goal, industry and the optional ICP advisor. */
export function Step1Identity() {
  const { data, updateStep1, nextStep } = useCampaignWizard()
  const { step1 } = data
  const [touched, setTouched] = useState(false)
  const isValid = step1.name.trim().length >= 2 && Boolean(step1.goal) && Boolean(step1.industry)
  const nameMissing = touched && !step1.name.trim()

  return (
    <div className="mx-auto max-w-2xl">
      <StepHeader step={1} title={t.title} intro={t.intro} />
      <div className="space-y-8">
        <div>
          <ExpressCampaign />
          <div className="mt-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-xs text-quiet">{t.orManual}</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </div>

        <div>
          <label htmlFor="campaign-name" className={fieldLabel}>{t.name} <span className="text-danger">*</span></label>
          <div className="relative">
            <input
              id="campaign-name"
              type="text"
              value={step1.name}
              onChange={(e) => updateStep1({ name: e.target.value })}
              placeholder={t.namePh}
              maxLength={60}
              aria-invalid={nameMissing || undefined}
              aria-describedby={nameMissing ? 'campaign-name-error' : undefined}
              className={cn(textControl, 'h-12 px-4 pr-14', nameMissing && 'border-danger/60')}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs tabular-nums text-quiet">{step1.name.length}/60</span>
          </div>
          {nameMissing && <p id="campaign-name-error" role="alert" className="mt-1.5 text-xs text-danger">{t.nameRequired}</p>}
        </div>

        <fieldset>
          <legend className={cn(fieldLabel, 'mb-3')}>{t.goal} <span className="text-danger">*</span></legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMPAIGN_GOALS.map(({ key, label, desc, icon }) => {
              const Icon = GOAL_ICON[icon]
              const selected = step1.goal === key
              return (
                <button key={key} type="button" onClick={() => updateStep1({ goal: key })} aria-pressed={selected}
                  className={cn('flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors duration-200 ease-signal', choiceClass(selected))}>
                  <span className="flex items-center gap-2">
                    <Icon className={cn('h-5 w-5', selected ? 'text-accent' : 'text-quiet')} aria-hidden="true" />
                    <span className={cn('text-sm font-bold', selected ? 'text-accent' : 'text-ink')}>{label}</span>
                  </span>
                  <span className="text-xs leading-relaxed text-quiet">{desc}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* Raised so the sector dropdown opens over the next card. */}
        <div className="relative z-20">
          <p className={cn(fieldLabel, 'mb-3')}>
            {t.industry} <span className="text-danger">*</span>
            <span className="ml-2 text-quiet">{t.industryHint}</span>
          </p>
          <SearchableMultiSelect
            options={[...INDUSTRIES]}
            selected={step1.industry ? [step1.industry] : []}
            onChange={(next) => updateStep1({ industry: next[0] ?? '' })}
            single
            allowCustom
            placeholder={t.industryPh}
          />
          {touched && !step1.industry && <p role="alert" className="mt-2 text-xs text-danger">{t.industryRequired}</p>}
        </div>

        <ProductIcpAdvisor />

        <div className="flex justify-end pt-2">
          <Button size="lg" onClick={() => { setTouched(true); if (isValid) nextStep() }} aria-disabled={!isValid} className={cn('px-6', !isValid && 'cursor-not-allowed opacity-60')}>
            {t.next}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
