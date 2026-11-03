'use client'

import { BrainCircuit, Check, ChevronLeft, ChevronRight, Users, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { SearchableMultiSelect } from '@/components/dashboard/campaign-wizard/SearchableMultiSelect'
import { StepHeader, choiceClass, fieldLabel, textControl } from '@/components/dashboard/campaign-wizard/StepHeader'
import { step2Copy as t, wizardCopy } from '@/lib/copy/campaign-wizard'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { GEOS, JOB_TITLES, type CompanySize } from '@/lib/types/campaign-wizard'
import { cn } from '@/lib/utils'

/** Step 2: titles, company sizes, zones, excluded domains, and the AI recommendation if any. */
export function Step2Targeting() {
  const { data, updateStep1, updateStep2, nextStep, prevStep } = useCampaignWizard()
  const { step2 } = data
  const icp = data.step1.icpSuggestion ?? null
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  // A plain formula (12 per title x size x zone), not a search result.
  const estimated = step2.targetTitles.length * step2.targetCompanySizes.length * step2.targetGeos.length * 12

  return (
    <div className="mx-auto max-w-2xl">
      <StepHeader step={2} title={t.title} intro={t.intro} />
      <div className="space-y-8">
        {icp && (
          <div className="flex items-start gap-3 rounded-lg border border-accent/25 bg-raised px-4 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10"><BrainCircuit className="h-4 w-4 text-accent" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink">{t.aiTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-quiet">{icp.reasoning}</p>
              <p className="mt-1.5 font-mono text-xs text-quiet">{t.aiNote}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => updateStep1({ icpSuggestion: null })} title={t.hideTitle} aria-label={t.hide} className="h-7 w-7 shrink-0 px-0">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-xs text-quiet">
              {t.titles}
              {step2.targetTitles.length > 0 && <span className="ml-2 tabular-nums text-accent">{t.selected(step2.targetTitles.length)}</span>}
            </p>
            {step2.targetTitles.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => updateStep2({ targetTitles: [] })} className="h-7 gap-1 px-2 text-xs">
                <X className="h-3 w-3" aria-hidden="true" /> {t.clear}
              </Button>
            )}
          </div>
          <SearchableMultiSelect options={[...JOB_TITLES]} selected={step2.targetTitles} onChange={(next) => updateStep2({ targetTitles: next })} allowCustom placeholder={t.titlesPh} />
        </div>

        <fieldset>
          <legend className={cn(fieldLabel, 'mb-3')}>{t.size}</legend>
          <div className="flex flex-wrap gap-2">
            {t.sizes.map(({ key, label, range }) => {
              const selected = step2.targetCompanySizes.includes(key)
              return (
                <button key={key} type="button" onClick={() => updateStep2({ targetCompanySizes: toggle<CompanySize>(step2.targetCompanySizes, key) })} aria-pressed={selected}
                  className={cn('flex flex-col items-center rounded-md border px-5 py-3 transition-colors duration-200 ease-signal', choiceClass(selected))}>
                  <span className={cn('text-sm font-bold', selected ? 'text-accent' : 'text-ink')}>{label}</span>
                  <span className="mt-0.5 font-mono text-xs tabular-nums text-quiet">{t.employees(range)}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div role="group" aria-labelledby="target-geos-label">
          <div className="mb-3 flex items-center justify-between">
            <p id="target-geos-label" className="font-mono text-xs text-quiet">{t.geos}</p>
            {step2.targetGeos.length === 0 && (
              <Button variant="ghost" size="sm" onClick={() => updateStep2({ targetGeos: ['France'] })} className="h-7 px-2 text-xs text-accent hover:text-accent">{t.franceDefault}</Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {GEOS.map((geo) => {
              const selected = step2.targetGeos.includes(geo)
              return (
                <button key={geo} type="button" onClick={() => updateStep2({ targetGeos: toggle(step2.targetGeos, geo) })} aria-pressed={selected}
                  className={cn('flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-200 ease-signal',
                    selected ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-quiet hover:border-quiet/50 hover:text-ink')}>
                  {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                  {geo}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor="excluded-domains" className={fieldLabel}>{t.excluded} <span className="ml-1 text-quiet">{t.optional}</span></label>
          <textarea id="excluded-domains" value={step2.excludedDomains} onChange={(e) => updateStep2({ excludedDomains: e.target.value })}
            placeholder={t.excludedPh} rows={2} className={cn(textControl, 'resize-none px-4 py-3')} />
        </div>

        {estimated > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-raised px-4 py-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-sm text-ink">
              {t.estimate}{' '}
              <strong className="font-mono tabular-nums text-accent">{t.estimateValue(estimated)}</strong>
              <span className="mt-0.5 block font-mono text-xs text-quiet">{t.estimateNote}</span>
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="lg" onClick={prevStep} className="px-5"><ChevronLeft className="h-4 w-4" aria-hidden="true" />{wizardCopy.previous}</Button>
          <Button size="lg" onClick={nextStep} className="px-6">{t.next}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </div>
    </div>
  )
}
