'use client'

/**
 * Optional AI module of step 1: the founder says what they sell, the AI
 * (ai.analyzeProduct) says whom to target and pre-fills step 2. Everything
 * stays editable there.
 */
import { useState } from 'react'
import { AlertCircle, BrainCircuit, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { callErrorText } from '@/components/dashboard/campaign-wizard/errors'
import { icpCopy as t } from '@/lib/copy/campaign-wizard'
import { api } from '@/lib/front/api'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import type { ProductProfile } from '@/lib/types/campaign-wizard'
import { cn } from '@/lib/utils'

const EMPTY_PRODUCT: ProductProfile = { enabled: false, description: '', website: '', pricing: '' }
const INPUT = 'w-full rounded-md border border-line bg-canvas text-ink outline-none transition-colors duration-200 ease-signal placeholder:text-quiet/60 focus:border-accent/50 disabled:opacity-50'

export function ProductIcpAdvisor() {
  const { data, updateStep1, updateStep2 } = useCampaignWizard()
  const product = data.step1.product ?? EMPTY_PRODUCT
  const suggestion = data.step1.icpSuggestion ?? null
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setProduct = (patch: Partial<ProductProfile>) => updateStep1({ product: { ...product, ...patch } })
  const length = product.description.trim().length
  const canAnalyze = length >= 30 && !analyzing

  const analyze = async () => {
    if (!canAnalyze) return
    setAnalyzing(true)
    setError(null)
    try {
      const { suggestion: x } = await api.call('ai.analyzeProduct', {
        body: { description: product.description.trim(), website: product.website.trim(), pricing: product.pricing, goal: data.step1.goal, industry: data.step1.industry },
      })
      updateStep2({ targetTitles: x.targetTitles, targetCompanySizes: x.targetCompanySizes, targetGeos: x.targetGeos })
      // The industry is filled only if the founder has not picked one.
      updateStep1({ icpSuggestion: x, ...(data.step1.industry ? {} : { industry: x.industry }) })
    } catch (err) {
      setError(callErrorText(err, t.failed, t.network))
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-raised transition-colors duration-200 ease-signal', product.enabled ? 'border-accent/25' : 'border-line')}>
      <button
        type="button"
        role="switch"
        aria-checked={product.enabled}
        onClick={() => setProduct({ enabled: !product.enabled })}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left focus-visible:outline-offset-[-2px]"
      >
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ease-signal', product.enabled ? 'border-accent/40 text-accent' : 'border-line text-quiet')}>
          <BrainCircuit className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink">{t.title}</span>
            <span className="font-mono text-xs text-quiet">{t.optional}</span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-quiet">{t.pitch}</span>
        </span>
        <span aria-hidden="true" className={cn('relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-signal', product.enabled ? 'border-accent bg-accent/25' : 'border-line bg-canvas')}>
          <span className={cn('absolute left-0.5 top-0.5 h-[14px] w-[14px] rounded-full transition-transform duration-200 ease-signal', product.enabled ? 'translate-x-4 bg-accent' : 'translate-x-0 bg-quiet')} />
        </span>
      </button>

      {product.enabled && (
        <div className="space-y-4 border-t border-line px-5 py-5">
          <div>
            <label htmlFor="icp-product-description" className="mb-1.5 block font-mono text-xs text-quiet">{t.what} <span className="text-danger">*</span></label>
            <textarea id="icp-product-description" value={product.description} onChange={(e) => setProduct({ description: e.target.value })}
              disabled={analyzing} rows={3} maxLength={1500} placeholder={t.whatPh} className={cn(INPUT, 'resize-none px-4 py-3 text-sm')} />
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-xs text-quiet">{t.whatHint}</p>
              <span className={cn('shrink-0 font-mono text-xs tabular-nums', length >= 30 ? 'text-quiet' : 'text-warning')}>{t.min(length)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="icp-product-website" className="mb-1.5 block font-mono text-xs text-quiet">{t.website} <span className="text-quiet">{t.optionalShort}</span></label>
              <input id="icp-product-website" value={product.website} onChange={(e) => setProduct({ website: e.target.value })} disabled={analyzing}
                placeholder={t.websitePh} className={cn(INPUT, 'h-10 px-3.5 text-xs')} />
            </div>
            <fieldset>
              <legend className="mb-1.5 block font-mono text-xs text-quiet">{t.pricing} <span className="text-quiet">{t.optionalShort}</span></legend>
              <div className="flex gap-1.5">
                {t.pricingOptions.map(({ key, label }) => (
                  <button key={key} type="button" disabled={analyzing} aria-pressed={product.pricing === key}
                    onClick={() => setProduct({ pricing: product.pricing === key ? '' : key })}
                    className={cn(
                      'min-h-10 flex-1 rounded-md border px-1 py-1 text-xs font-semibold leading-tight transition-colors duration-200 ease-signal disabled:opacity-50',
                      product.pricing === key ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-canvas text-quiet hover:border-quiet/50 hover:text-ink',
                    )}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-canvas px-3.5 py-2.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {!suggestion ? (
            <Button size="lg" onClick={() => void analyze()} disabled={!canAnalyze} aria-busy={analyzing || undefined} className="w-full">
              {analyzing
                ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t.analyzing}</>
                : <><Sparkles className="h-4 w-4" aria-hidden="true" />{t.analyze}</>}
            </Button>
          ) : (
            <div className="rounded-md border border-accent/25 bg-canvas p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                <p className="text-xs font-bold text-ink">{t.applied}</p>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-quiet">{suggestion.reasoning}</p>
              <dl className="space-y-2">
                <div>
                  <dt className="sr-only">{t.titles}</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {suggestion.targetTitles.map((x) => <span key={x} className="rounded-md border border-accent/25 px-2 py-0.5 text-xs text-accent">{x}</span>)}
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">{t.sizesGeos}</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {suggestion.targetCompanySizes.map((sz) => (
                      <span key={sz} className="rounded-md border border-line px-2 py-0.5 font-mono text-xs tabular-nums text-ink/80">{t.employees(t.sizeRange[sz] ?? sz)}</span>
                    ))}
                    {suggestion.targetGeos.map((g) => <span key={g} className="rounded-md border border-line px-2 py-0.5 text-xs text-ink/80">{g}</span>)}
                  </dd>
                </div>
              </dl>
              <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-xs text-quiet">{t.editable}</p>
                <Button variant="ghost" size="sm" onClick={() => void analyze()} disabled={analyzing} className="h-8 px-2.5 text-xs">
                  {analyzing ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
                  {t.rerun}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
