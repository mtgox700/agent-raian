'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Zap, Check, Database, Search, Loader2 } from 'lucide-react'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-void'

type Source = 'ai' | 'manual'

const SOURCES: { key: Source; icon: typeof Zap; label: string; desc: string; badge?: string }[] = [
  {
    key: 'ai',
    icon: Zap,
    label: 'Prospection IA',
    desc: "L'IA recherche les décideurs qui correspondent à votre cible, vérifie leur e-mail et les note.",
    badge: 'Recommandé',
  },
  {
    key: 'manual',
    icon: Database,
    label: 'Base existante',
    desc: "Choisissez des leads déjà présents dans Phantera, qui ne sont dans aucune campagne.",
  },
]

function AIProspectionConfig({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
  const PRESETS = [50, 100, 200, 500, 1000]

  return (
    <div className="mt-5 rounded-[10px] border border-cyan/25 bg-obsidian p-5">
      <p id="ai-volume-label" className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <Zap className="h-4 w-4 text-cyan" aria-hidden />
        Volume de prospection IA
      </p>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-labelledby="ai-volume-label">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={volume === p}
            className={cn(
              'rounded-md border px-4 py-1.5 font-mono text-xs font-bold tabular-nums transition-colors duration-150 ease-signal',
              FOCUS_RING,
              volume === p
                ? 'border-cyan/50 bg-cyan/10 text-cyan'
                : 'border-border text-muted hover:border-white/20 hover:text-white',
            )}
          >
            {p.toLocaleString('fr-FR')} leads
          </button>
        ))}
      </div>

      <ul className="grid gap-1.5">
        {[
          'Recherche des décideurs dans une base B2B',
          "Vérification de l'e-mail professionnel",
          'Note de correspondance à votre cible calculée par IA (sur 100)',
          'Les leads déjà dans votre base sont écartés',
        ].map((feat) => (
          <li key={feat} className="flex items-center gap-2 text-xs text-muted">
            <Check className="h-3 w-3 flex-shrink-0 text-cyan" aria-hidden />
            {feat}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-md border border-border bg-void px-4 py-2.5">
        <p className="font-mono text-xs text-muted">Bon à savoir</p>
        <p className="text-xs text-white/80">
          {`Jusqu'à ${volume.toLocaleString('fr-FR')} leads recherchés. Les leads dont l'e-mail n'a pas pu être vérifié vous sont signalés et ne sont contactés qu'avec votre accord.`}
        </p>
      </div>
    </div>
  )
}

interface AvailableLead {
  id:         string
  firstName:  string
  lastName:   string
  company:    string | null
  title:      string | null
  aiScore:    number | null
  scoreBadge: string
}

/** One campaign creation attaches at most this many leads. */
const MAX_PICKED_LEADS = 1000

// Leads already in Phantera, not in a campaign, contactable. The campaign is
// created with them and its first message is queued right away; it used to be
// created empty, with instructions to assign leads by hand afterwards.
function ExistingBaseConfig({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [leads, setLeads] = useState<AvailableLead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/leads/available?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        const data = await res.json() as { data?: { leads: AvailableLead[]; total: number }; error?: string }
        if (!res.ok || !data.data) throw new Error(data.error ?? 'Chargement impossible')
        setLeads(data.data.leads)
        setTotal(data.data.total)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Impossible de charger vos leads. Réessayez.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const selectedSet = new Set(selected)
  const visibleIds = leads.map((l) => l.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selected.filter((x) => x !== id))
    else if (selected.length < MAX_PICKED_LEADS) onChange([...selected, id])
  }
  const toggleVisible = () => {
    if (allVisibleSelected) onChange(selected.filter((id) => !visibleIds.includes(id)))
    else onChange([...new Set([...selected, ...visibleIds])].slice(0, MAX_PICKED_LEADS))
  }

  return (
    <div className="mt-5 rounded-[10px] border border-border bg-obsidian">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Nom, entreprise, poste..."
            aria-label="Rechercher un lead"
            className="h-9 w-full rounded-md border border-border bg-void pl-9 pr-3 text-xs text-white placeholder-muted/60 outline-none transition-colors duration-150 ease-signal focus:border-cyan/50"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleVisible}
          disabled={visibleIds.length === 0}
          className="h-9 px-3 text-xs"
        >
          {allVisibleSelected ? 'Tout désélectionner' : `Tout sélectionner (${visibleIds.length})`}
        </Button>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {loading && leads.length === 0 ? (
          <p className="flex items-center justify-center gap-2 p-6 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Chargement de vos leads...
          </p>
        ) : error ? (
          <p className="p-6 text-center text-xs text-danger" role="alert">{error}</p>
        ) : leads.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">
            {query
              ? 'Aucun lead disponible pour cette recherche.'
              : 'Aucun lead disponible : vos leads qualifiés sont déjà dans une campagne. Choisissez la prospection IA.'}
          </p>
        ) : (
          leads.map((lead) => {
            const checked = selectedSet.has(lead.id)
            return (
              <label
                key={lead.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 transition-colors duration-150 ease-signal last:border-b-0',
                  checked ? 'bg-cyan/[0.04]' : 'hover:bg-white/[0.02]',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(lead.id)}
                  className="h-3.5 w-3.5 accent-[var(--brand-primary)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{lead.firstName} {lead.lastName}</p>
                  <p className="truncate text-xs text-muted">{[lead.title, lead.company].filter(Boolean).join(', ') || '-'}</p>
                </div>
                {lead.aiScore !== null && (
                  <span className="font-mono text-xs tabular-nums text-muted" title="Note IA sur 100">{lead.aiScore}</span>
                )}
              </label>
            )
          })
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 font-mono text-xs tabular-nums">
        <span className={selected.length > 0 ? 'font-semibold text-cyan' : 'text-muted'}>
          {selected.length} lead{selected.length > 1 ? 's' : ''} sélectionné{selected.length > 1 ? 's' : ''}
        </span>
        <span className="text-muted">
          {total > leads.length ? `${leads.length} affichés sur ${total} : affinez la recherche` : `${total} disponible${total > 1 ? 's' : ''}`}
        </span>
      </div>
    </div>
  )
}

export function Step4Leads() {
  const { data, updateStep4, nextStep, prevStep } = useCampaignWizard()
  const { step4 } = data
  const canProceed =
    step4.leadSource === 'ai' || (step4.leadSource === 'manual' && (step4.leadIds?.length ?? 0) > 0)

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <p className="mb-3 font-mono text-xs text-cyan">Étape 04 sur 05</p>
        <h2 className="font-display text-3xl font-bold text-white">Source de leads</h2>
        <p className="mt-2 text-sm text-muted">
          Choisissez comment alimenter votre campagne en prospects qualifiés.
        </p>
      </header>

      {/* Source selector */}
      <div className="mb-2 space-y-3" role="group" aria-label="Source de leads">
        {SOURCES.map(({ key, icon: Icon, label, desc, badge }) => {
          const selected = step4.leadSource === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => updateStep4({ leadSource: key })}
              className={cn(
                'w-full rounded-[10px] border p-4 text-left transition-colors duration-150 ease-signal',
                FOCUS_RING,
                selected ? 'border-cyan bg-cyan/[0.06]' : 'border-border bg-obsidian hover:border-white/20',
              )}
            >
              <span className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border',
                    selected ? 'border-cyan/40 text-cyan' : 'border-border text-muted',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('text-sm font-bold', selected ? 'text-white' : 'text-white/80')}>
                      {label}
                    </span>
                    {badge && <span className="font-mono text-xs text-cyan">{badge}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{desc}</span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border',
                    selected ? 'border-cyan bg-cyan' : 'border-border',
                  )}
                >
                  {selected && <Check className="h-3 w-3 text-void" />}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Config panel */}
      {step4.leadSource === 'ai' && (
        <AIProspectionConfig
          volume={step4.estimatedLeads}
          onChange={(v) => updateStep4({ estimatedLeads: v })}
        />
      )}
      {step4.leadSource === 'manual' && (
        <ExistingBaseConfig
          selected={step4.leadIds ?? []}
          onChange={(ids) => updateStep4({ leadIds: ids })}
        />
      )}

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" size="lg" onClick={prevStep} className="gap-2 px-5">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Retour
        </Button>
        <Button
          size="lg"
          onClick={nextStep}
          disabled={!canProceed}
          title={canProceed ? undefined : 'Sélectionnez au moins un lead'}
          className="gap-2 px-6"
        >
          Vérifier et lancer
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
