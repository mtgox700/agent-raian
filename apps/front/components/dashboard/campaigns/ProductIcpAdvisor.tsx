'use client'

/**
 * ProductIcpAdvisor: optional AI module on wizard Step 1.
 *
 * The founder describes WHAT they sell; the AI recommends WHO to target and
 * pre-fills Step 2 (titles, company sizes, geos, industry). Everything stays
 * editable there. Design: an instrument card with a switch, a focused form,
 * and a result panel that shows the AI's reasoning + the applied values.
 */

import { useState } from 'react'
import { BrainCircuit, Loader2, Sparkles, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { IcpSuggestion, ProductProfile } from '@/lib/types/campaign-wizard'

const EMPTY_PRODUCT: ProductProfile = { enabled: false, description: '', website: '', pricing: '' }

const PRICING_OPTIONS = [
  { key: 'low' as const,  label: 'Moins de 100 € / mois' },
  { key: 'mid' as const,  label: '100 à 500 € / mois' },
  { key: 'high' as const, label: '500 € et plus / contrat' },
]

// Same ranges as the search actually sent (lib/services/apollo.ts).
const SIZE_LABELS: Record<string, string> = {
  XS: '1 à 10', S: '11 à 50', M: '51 à 200', L: '201 à 1 000', XL: '1 001 à 10 000',
}

export function ProductIcpAdvisor() {
  const { data, updateStep1, updateStep2 } = useCampaignWizard()
  const product    = data.step1.product ?? EMPTY_PRODUCT
  const suggestion = data.step1.icpSuggestion ?? null

  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const setProduct = (patch: Partial<ProductProfile>) =>
    updateStep1({ product: { ...product, ...patch } })

  const canAnalyze = product.description.trim().length >= 30 && !analyzing

  const analyze = async () => {
    if (!canAnalyze) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/analyze-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: product.description.trim(),
          website:     product.website.trim(),
          pricing:     product.pricing,
          goal:        data.step1.goal,
          industry:    data.step1.industry,
        }),
      })
      const out = (await res.json()) as { ok?: boolean; suggestion?: IcpSuggestion; error?: string }
      if (!res.ok || !out.ok || !out.suggestion) {
        setError(out.error ?? 'Analyse impossible, réessayez')
        return
      }
      const s = out.suggestion
      // Apply to Step 2: the user edits freely there.
      updateStep2({
        targetTitles:       s.targetTitles,
        targetCompanySizes: s.targetCompanySizes,
        targetGeos:         s.targetGeos,
      })
      updateStep1({
        icpSuggestion: s,
        // Fill the industry only if the founder hasn't picked one himself.
        ...(data.step1.industry ? {} : { industry: s.industry }),
      })
    } catch {
      setError('Erreur réseau, réessayez')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[10px] border transition-colors duration-200 ease-signal',
        product.enabled ? 'border-cyan/25 bg-obsidian' : 'border-border bg-obsidian',
      )}
    >
      {/* Header: icon + pitch + switch */}
      <button
        type="button"
        role="switch"
        aria-checked={product.enabled}
        onClick={() => setProduct({ enabled: !product.enabled })}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan"
      >
        <span
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ease-signal',
            product.enabled ? 'border-cyan/40 text-cyan' : 'border-border text-muted',
          )}
        >
          <BrainCircuit className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">Recommandation IA du ciblage</span>
            <span className="font-mono text-xs text-muted">Facultatif, plan Business</span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
            Décrivez ce que vous vendez : l&apos;IA détermine qui cibler et pré-remplit
            l&apos;étape Ciblage. Vous gardez la main sur chaque valeur.
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            'relative h-5 w-9 flex-shrink-0 rounded-full border transition-colors duration-200 ease-signal',
            product.enabled ? 'border-cyan bg-cyan/25' : 'border-border bg-void',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 top-0.5 h-[14px] w-[14px] rounded-full transition-transform duration-200 ease-signal',
              product.enabled ? 'translate-x-4 bg-cyan' : 'translate-x-0 bg-muted',
            )}
          />
        </span>
      </button>

      {product.enabled && (
        <div className="space-y-4 border-t border-border px-5 py-5">
          {/* Description */}
          <div>
            <label htmlFor="icp-product-description" className="mb-1.5 block font-mono text-xs text-muted">
              Que vendez-vous ? <span className="text-danger">*</span>
            </label>
            <textarea
              id="icp-product-description"
              value={product.description}
              onChange={(e) => setProduct({ description: e.target.value })}
              disabled={analyzing}
              rows={3}
              maxLength={1500}
              placeholder="ex. : Formations en IA agentique pour dirigeants et équipes (1 à 3 jours, présentiel ou distanciel, finançables OPCO). Conçues par des praticiens qui déploient des agents en production."
              className="w-full resize-none rounded-md border border-border bg-void px-4 py-3 text-sm text-white placeholder-muted/60 outline-none transition-colors duration-150 ease-signal focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20 disabled:opacity-50"
            />
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Plus la description est précise (offre, bénéfice, format), plus le ciblage est juste.
              </p>
              <span className={cn('flex-shrink-0 font-mono text-xs tabular-nums', product.description.trim().length >= 30 ? 'text-muted' : 'text-warning')}>
                {product.description.trim().length}/30 min
              </span>
            </div>
          </div>

          {/* Website + pricing */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="icp-product-website" className="mb-1.5 block font-mono text-xs text-muted">
                Site web <span className="text-muted">(facultatif)</span>
              </label>
              <input
                id="icp-product-website"
                value={product.website}
                onChange={(e) => setProduct({ website: e.target.value })}
                disabled={analyzing}
                placeholder="votre-produit.com"
                className="h-10 w-full rounded-md border border-border bg-void px-3.5 text-xs text-white placeholder-muted/60 outline-none transition-colors duration-150 ease-signal focus:border-cyan/50 disabled:opacity-50"
              />
            </div>
            <fieldset>
              <legend className="mb-1.5 block font-mono text-xs text-muted">
                Niveau de prix <span className="text-muted">(facultatif)</span>
              </legend>
              <div className="flex gap-1.5">
                {PRICING_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={analyzing}
                    aria-pressed={product.pricing === key}
                    onClick={() => setProduct({ pricing: product.pricing === key ? '' : key })}
                    className={cn(
                      'min-h-10 flex-1 rounded-md border px-1 py-1 text-xs font-semibold leading-tight transition-colors duration-150 ease-signal disabled:opacity-50',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian',
                      product.pricing === key
                        ? 'border-cyan/50 bg-cyan/10 text-cyan'
                        : 'border-border bg-void text-muted hover:border-white/20 hover:text-white',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-void px-3.5 py-2.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-danger" aria-hidden />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {/* Analyze CTA / Result */}
          {!suggestion ? (
            <Button
              size="lg"
              onClick={analyze}
              disabled={!canAnalyze}
              aria-busy={analyzing || undefined}
              className="w-full gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Analyse du produit et du marché...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Analyser et recommander mon ciblage
                </>
              )}
            </Button>
          ) : (
            <div className="rounded-md border border-cyan/25 bg-void p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success-fg" aria-hidden />
                <p className="text-xs font-bold text-white">Ciblage recommandé et appliqué à l&apos;étape 2</p>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-muted">{suggestion.reasoning}</p>

              <dl className="space-y-2">
                <div>
                  <dt className="sr-only">Postes</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {suggestion.targetTitles.map((t) => (
                      <span key={t} className="rounded-md border border-cyan/25 px-2 py-0.5 text-xs text-cyan">
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Tailles et zones</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {suggestion.targetCompanySizes.map((sz) => (
                      <span key={sz} className="rounded-md border border-border px-2 py-0.5 font-mono text-xs tabular-nums text-white/80">
                        {SIZE_LABELS[sz] ?? sz} salariés
                      </span>
                    ))}
                    {suggestion.targetGeos.map((g) => (
                      <span key={g} className="rounded-md border border-border px-2 py-0.5 text-xs text-white/80">
                        {g}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>

              <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted">
                  Chaque valeur reste modifiable à l&apos;étape Ciblage.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={analyze}
                  disabled={analyzing}
                  className="h-8 gap-1.5 px-2.5 text-xs text-muted"
                >
                  {analyzing
                    ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />
                    : <RefreshCw className="h-3 w-3" aria-hidden />}
                  Relancer l&apos;analyse
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
