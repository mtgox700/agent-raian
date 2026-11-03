'use client'

import { useState } from 'react'
import { CalendarCheck, ChevronRight, Coins, Radio, Target, type LucideIcon } from 'lucide-react'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { CAMPAIGN_GOALS, INDUSTRIES, type GoalIcon } from '@/lib/types/campaign-wizard'
import { SearchableMultiSelect } from '@/components/dashboard/SearchableMultiSelect'
import { ProductIcpAdvisor } from '@/components/dashboard/campaigns/ProductIcpAdvisor'
import { ExpressCampaign } from '@/components/dashboard/campaigns/ExpressCampaign'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const GOAL_ICON: Record<GoalIcon, LucideIcon> = { target: Target, calendar: CalendarCheck, coins: Coins, radio: Radio }

export function Step1Identity() {
  const { data, updateStep1, nextStep } = useCampaignWizard()
  const { step1 } = data
  const [touched, setTouched] = useState(false)

  const isValid = step1.name.trim().length >= 2 && step1.goal && step1.industry

  const handleNext = () => {
    setTouched(true)
    if (isValid) nextStep()
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-10">
        <p className="mb-3 font-mono text-xs text-cyan">Étape 01 sur 05</p>
        <h2 className="font-display text-3xl font-bold text-white">
          Donnez vie à votre campagne
        </h2>
        <p className="mt-2 text-sm text-muted">
          Définissez l&apos;identité et l&apos;objectif de votre campagne de prospection.
        </p>
      </header>

      <div className="space-y-8">
        {/* Express campaign: paste a URL, land on Step 3 with everything filled */}
        <div>
          <ExpressCampaign />
          <div className="mt-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-xs text-muted">ou configurez manuellement</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>

        {/* Campaign name */}
        <div>
          <label htmlFor="campaign-name" className="mb-2 block font-mono text-xs text-muted">
            Nom de la campagne <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <input
              id="campaign-name"
              type="text"
              value={step1.name}
              onChange={(e) => updateStep1({ name: e.target.value })}
              placeholder="ex. : Directeurs techniques SaaS France T3 2026"
              maxLength={60}
              aria-invalid={touched && !step1.name.trim() ? true : undefined}
              className={cn(
                'h-12 w-full rounded-md border bg-obsidian px-4 pr-14 text-sm text-white placeholder-muted/60 outline-none transition-colors duration-150 ease-signal',
                touched && !step1.name.trim()
                  ? 'border-danger/60 ring-1 ring-danger/20'
                  : 'border-border focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20',
              )}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs tabular-nums text-muted">
              {step1.name.length}/60
            </span>
          </div>
          {touched && !step1.name.trim() && (
            <p className="mt-1.5 text-xs text-danger">Le nom est obligatoire</p>
          )}
        </div>

        {/* Campaign goal */}
        <fieldset>
          <legend className="mb-3 block font-mono text-xs text-muted">
            Objectif principal <span className="text-danger">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {CAMPAIGN_GOALS.map(({ key, label, desc, icon }) => {
              const Icon = GOAL_ICON[icon]
              const selected = step1.goal === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateStep1({ goal: key })}
                  aria-pressed={selected}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-[10px] border p-4 text-left transition-colors duration-150 ease-signal',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                    selected
                      ? 'border-cyan bg-cyan/[0.06]'
                      : 'border-border bg-obsidian hover:border-white/20',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn('h-5 w-5', selected ? 'text-cyan' : 'text-muted')} aria-hidden="true" />
                    <span className={cn('text-sm font-bold', selected ? 'text-cyan' : 'text-white')}>
                      {label}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-muted">{desc}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* Industry: raised above the next card so the sector dropdown opens over it. */}
        <div className="relative z-20">
          <p className="mb-3 block font-mono text-xs text-muted">
            Secteur cible <span className="text-danger">*</span>
            <span className="ml-2 text-muted">recherchez ou ajoutez le vôtre</span>
          </p>
          <SearchableMultiSelect
            options={[...INDUSTRIES]}
            selected={step1.industry ? [step1.industry] : []}
            onChange={(next) => updateStep1({ industry: next[0] ?? '' })}
            single
            allowCustom
            placeholder="Rechercher un secteur (ex. : SaaS, FinTech, Santé...)"
            color="var(--brand-primary)"
          />
          {touched && !step1.industry && (
            <p className="mt-2 text-xs text-danger">Sélectionnez un secteur</p>
          )}
        </div>

        {/* AI ICP advisor: optional, describe the product, get Step 2 pre-filled */}
        <ProductIcpAdvisor />

        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            onClick={handleNext}
            aria-disabled={!isValid}
            className={cn('gap-2 px-6', !isValid && 'cursor-not-allowed bg-surface text-muted hover:bg-surface')}
          >
            Définir le ciblage
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
