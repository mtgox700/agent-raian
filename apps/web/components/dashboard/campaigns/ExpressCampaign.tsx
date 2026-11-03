'use client'

/**
 * ExpressCampaign: the whole wizard pre-filled from a website URL.
 *
 * Top of wizard Step 1: paste your website URL -> one AI pass fills the ENTIRE
 * wizard (identity, product profile, ICP, tone, value proposition) -> the user
 * lands on Step 3 where sequence generation is one click away. Staged loading
 * copy narrates what the AI is doing (the wait IS the demo).
 */

import { useEffect, useRef, useState } from 'react'
import { Zap, ArrowRight, Loader2, AlertCircle, Globe } from 'lucide-react'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { Button } from '@/components/ui/button'
import type { CampaignGoal, CompanySize, EmailTone } from '@/lib/types/campaign-wizard'

interface ExpressSetup {
  campaignName:       string
  goal:               string
  industry:           string
  productDescription: string
  pricing:            string
  website:            string
  targetTitles:       string[]
  targetCompanySizes: CompanySize[]
  targetGeos:         string[]
  tone:               string
  valueProposition:   string
  reasoning:          string
}

const LOADING_STAGES = [
  'Lecture de votre site...',
  'Analyse de votre offre et de son marché...',
  'Identification des décideurs à cibler...',
  'Préparation de votre campagne...',
]

export function ExpressCampaign() {
  const { updateStep1, updateStep2, updateStep3, setStep } = useCampaignWizard()
  const [url, setUrl]         = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage]     = useState(0)
  const [error, setError]     = useState<string | null>(null)
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Rotate the narration while the analysis runs (~10-20s total).
  useEffect(() => {
    if (loading) {
      setStage(0)
      stageTimer.current = setInterval(
        () => setStage((s) => Math.min(s + 1, LOADING_STAGES.length - 1)),
        4000,
      )
    }
    return () => { if (stageTimer.current) clearInterval(stageTimer.current) }
  }, [loading])

  const launch = async () => {
    if (!url.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/campaign-from-url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: url.trim() }),
      })
      const out = (await res.json()) as { ok?: boolean; setup?: ExpressSetup; error?: string }
      if (!res.ok || !out.ok || !out.setup) {
        setError(out.error ?? 'Analyse impossible, réessayez')
        return
      }
      const s = out.setup

      // Fill the whole wizard: every value stays editable at its own step.
      updateStep1({
        name:     s.campaignName,
        goal:     (['leads', 'demos', 'sales', 'awareness'].includes(s.goal) ? s.goal : 'leads') as CampaignGoal,
        industry: s.industry,
        product: {
          enabled:     true,
          description: s.productDescription,
          website:     s.website,
          pricing:     (['low', 'mid', 'high'].includes(s.pricing) ? s.pricing : '') as '' | 'low' | 'mid' | 'high',
        },
        icpSuggestion: {
          targetTitles:       s.targetTitles,
          targetCompanySizes: s.targetCompanySizes,
          targetGeos:         s.targetGeos,
          industry:           s.industry,
          reasoning:          s.reasoning,
          appliedAt:          new Date().toISOString(),
        },
      })
      updateStep2({
        targetTitles:       s.targetTitles,
        targetCompanySizes: s.targetCompanySizes,
        targetGeos:         s.targetGeos,
      })
      updateStep3({
        tone:             (['professional', 'casual', 'bold', 'consultative'].includes(s.tone) ? s.tone : 'professional') as EmailTone,
        valueProposition: s.valueProposition,
      })
      // Land on Step 3: sequence generation is one click away: watching the
      // AI write the emails IS the wow moment, we keep it.
      setStep(3)
    } catch {
      setError('Erreur réseau, réessayez')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      aria-labelledby="express-campaign-title"
      className="rounded-[10px] border border-cyan/25 bg-obsidian p-5"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan/30 text-cyan">
          <Zap className="h-4 w-4" aria-hidden />
        </div>
        <h3 id="express-campaign-title" className="font-display text-sm font-bold text-white">
          Campagne express
        </h3>
        <span className="font-mono text-xs text-muted">Plan Business</span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        Collez l&apos;adresse de votre site : l&apos;IA lit votre offre, choisit qui cibler et
        prépare toute la campagne. Vous n&apos;avez plus qu&apos;à relire.
      </p>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex h-12 items-center gap-3 rounded-md border border-cyan/25 bg-void px-4"
        >
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-cyan motion-reduce:animate-none" aria-hidden />
          <span className="font-mono text-xs text-white/80">{LOADING_STAGES[stage]}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void launch() }}
              placeholder="votre-site.com"
              aria-label="Adresse de votre site"
              className="h-12 w-full rounded-md border border-border bg-void pl-10 pr-4 text-sm text-white placeholder-muted/60 outline-none transition-colors duration-150 ease-signal focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20"
            />
          </div>
          <Button size="lg" onClick={launch} disabled={!url.trim()} className="h-12 gap-2 px-5">
            Créer ma campagne
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-void px-3.5 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-danger" aria-hidden />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}
    </section>
  )
}
