'use client'

import { Check, ChevronLeft, ChevronRight, X, Users, BrainCircuit } from 'lucide-react'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { JOB_TITLES, GEOS, type CompanySize } from '@/lib/types/campaign-wizard'
import { SearchableMultiSelect } from '@/components/dashboard/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Ranges match the search actually sent (lib/services/apollo.ts SIZE_TO_APOLLO_RANGE).
const SIZES: { key: CompanySize; label: string; range: string }[] = [
  { key: 'XS', label: 'TPE', range: '1 à 10' },
  { key: 'S', label: 'Petite entreprise', range: '11 à 50' },
  { key: 'M', label: 'Moyenne entreprise', range: '51 à 200' },
  { key: 'L', label: 'ETI', range: '201 à 1 000' },
  { key: 'XL', label: 'Grand groupe', range: '1 001 à 10 000' },
]

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-void'

function MultiSelect<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: T[]
  selected: T[]
  onToggle: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            aria-pressed={isSelected}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-signal',
              FOCUS_RING,
              isSelected
                ? 'border-cyan/50 bg-cyan/10 text-cyan'
                : 'border-border text-muted hover:border-white/20 hover:text-white',
            )}
          >
            {isSelected && <Check className="h-3 w-3" aria-hidden />}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

export function Step2Targeting() {
  const { data, updateStep1, updateStep2, nextStep, prevStep } = useCampaignWizard()
  const { step2 } = data
  const icpSuggestion = data.step1.icpSuggestion ?? null

  const toggleSize = (s: CompanySize) => {
    updateStep2({
      targetCompanySizes: step2.targetCompanySizes.includes(s)
        ? step2.targetCompanySizes.filter((x) => x !== s)
        : [...step2.targetCompanySizes, s],
    })
  }

  const toggleGeo = (g: string) => {
    updateStep2({
      targetGeos: step2.targetGeos.includes(g)
        ? step2.targetGeos.filter((x) => x !== g)
        : [...step2.targetGeos, g],
    })
  }

  const estimatedLeads = step2.targetTitles.length * step2.targetCompanySizes.length * step2.targetGeos.length * 12

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-10">
        <p className="mb-3 font-mono text-xs text-cyan">Étape 02 sur 05</p>
        <h2 className="font-display text-3xl font-bold text-white">Définissez votre cible</h2>
        <p className="mt-2 text-sm text-muted">
          Ciblez précisément les décideurs que vous voulez atteindre.
        </p>
      </header>

      <div className="space-y-8">
        {/* AI recommendation banner: dismissible, values below stay editable */}
        {icpSuggestion && (
          <div className="flex items-start gap-3 rounded-[10px] border border-cyan/25 bg-obsidian px-4 py-3.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-cyan/30 bg-cyan/10">
              <BrainCircuit className="h-4 w-4 text-cyan" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white">Ciblage recommandé par l&apos;IA d&apos;après votre produit</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{icpSuggestion.reasoning}</p>
              <p className="mt-1.5 font-mono text-xs text-muted">
                Les champs ci-dessous sont pré-remplis. Ajustez librement : vous avez le dernier mot.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => updateStep1({ icpSuggestion: null })}
              title="Masquer la recommandation (le ciblage reste en place)"
              aria-label="Masquer la recommandation"
              className="h-7 w-7 flex-shrink-0 text-muted"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}

        {/* Titles */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-xs text-muted">
              Postes ciblés
              {step2.targetTitles.length > 0 && (
                <span className="ml-2 tabular-nums text-cyan">
                  {step2.targetTitles.length} sélectionnés
                </span>
              )}
            </p>
            {step2.targetTitles.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateStep2({ targetTitles: [] })}
                className="h-7 gap-1 px-2 text-xs text-muted"
              >
                <X className="h-3 w-3" aria-hidden /> Effacer
              </Button>
            )}
          </div>
          <SearchableMultiSelect
            options={[...JOB_TITLES]}
            selected={step2.targetTitles}
            onChange={(next) => updateStep2({ targetTitles: next })}
            allowCustom
            placeholder="Rechercher un poste (ex. : CEO, VP Sales, Head of Growth...)"
            color="var(--brand-primary)"
          />
        </div>

        {/* Company size */}
        <fieldset>
          <legend className="mb-3 block font-mono text-xs text-muted">Taille d&apos;entreprise</legend>
          <div className="flex flex-wrap gap-2">
            {SIZES.map(({ key, label, range }) => {
              const selected = step2.targetCompanySizes.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSize(key)}
                  aria-pressed={selected}
                  className={cn(
                    'flex flex-col items-center rounded-md border px-5 py-3 transition-colors duration-150 ease-signal',
                    FOCUS_RING,
                    selected
                      ? 'border-cyan bg-cyan/[0.06]'
                      : 'border-border bg-obsidian hover:border-white/20',
                  )}
                >
                  <span className={cn('text-sm font-bold', selected ? 'text-cyan' : 'text-white')}>{label}</span>
                  <span className="mt-0.5 font-mono text-xs tabular-nums text-muted">{range} sal.</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* Geography */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-xs text-muted">Zones géographiques</p>
            {step2.targetGeos.length === 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateStep2({ targetGeos: ['France'] })}
                className="h-7 px-2 text-xs text-cyan hover:text-cyan"
              >
                France par défaut
              </Button>
            )}
          </div>
          <MultiSelect
            options={GEOS as string[] as typeof GEOS[number][]}
            selected={step2.targetGeos as typeof GEOS[number][]}
            onToggle={toggleGeo as (v: typeof GEOS[number]) => void}
          />
        </div>

        {/* Excluded domains */}
        <div>
          <label htmlFor="excluded-domains" className="mb-2 block font-mono text-xs text-muted">
            Domaines exclus <span className="ml-1 text-muted">(facultatif)</span>
          </label>
          <textarea
            id="excluded-domains"
            value={step2.excludedDomains}
            onChange={(e) => updateStep2({ excludedDomains: e.target.value })}
            placeholder="concurrent.com, client-existant.fr, ..."
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-obsidian px-4 py-3 text-sm text-white placeholder-muted/60 outline-none transition-colors duration-150 ease-signal focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20"
          />
        </div>

        {/* Estimate: a plain formula (12 per title x size x zone), not a search result */}
        {estimatedLeads > 0 && (
          <div className="flex items-start gap-3 rounded-[10px] border border-border bg-obsidian px-4 py-3">
            <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan" aria-hidden />
            <p className="text-sm text-white">
              Ordre de grandeur :{' '}
              <strong className="font-mono tabular-nums text-cyan">
                environ {estimatedLeads.toLocaleString('fr-FR')} leads
              </strong>
              <span className="mt-0.5 block font-mono text-xs text-muted">
                Indicatif : 12 par combinaison de poste, taille et zone. Le volume réel dépend de la recherche.
              </span>
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="lg" onClick={prevStep} className="gap-2 px-5">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Retour
          </Button>
          <Button size="lg" onClick={nextStep} className="gap-2 px-6">
            Générer la séquence
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
