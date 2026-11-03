'use client'

/**
 * Campagne express: paste the website, one AI pass (ai.campaignFromUrl)
 * fills the whole wizard, the user lands on step 3 where the sequence is one
 * click away. Staged copy narrates what the AI is doing while it runs.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Globe, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui'
import { callErrorText } from '@/components/dashboard/campaign-wizard/errors'
import { expressCopy as t } from '@/lib/copy/campaign-wizard'
import { api } from '@/lib/front/api'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import type { CampaignGoal, EmailTone } from '@/lib/types/campaign-wizard'

const GOALS = ['leads', 'demos', 'sales', 'awareness']
const TONES = ['professional', 'casual', 'bold', 'consultative']
const PRICINGS = ['low', 'mid', 'high']

export function ExpressCampaign() {
  const { updateStep1, updateStep2, updateStep3, setStep } = useCampaignWizard()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (loading) {
      setStage(0)
      timer.current = setInterval(() => setStage((n) => Math.min(n + 1, t.stages.length - 1)), 4000)
    }
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [loading])

  const launch = async () => {
    if (!url.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const { setup: x } = await api.call('ai.campaignFromUrl', { body: { url: url.trim() } })
      // Every value stays editable at its own step.
      updateStep1({
        name: x.campaignName,
        goal: (GOALS.includes(x.goal) ? x.goal : 'leads') as CampaignGoal,
        industry: x.industry,
        product: {
          enabled: true,
          description: x.productDescription,
          website: x.website,
          pricing: (PRICINGS.includes(x.pricing) ? x.pricing : '') as '' | 'low' | 'mid' | 'high',
        },
        icpSuggestion: {
          targetTitles: x.targetTitles,
          targetCompanySizes: x.targetCompanySizes,
          targetGeos: x.targetGeos,
          industry: x.industry,
          reasoning: x.reasoning,
          appliedAt: new Date().toISOString(),
        },
      })
      updateStep2({ targetTitles: x.targetTitles, targetCompanySizes: x.targetCompanySizes, targetGeos: x.targetGeos })
      updateStep3({ tone: (TONES.includes(x.tone) ? x.tone : 'professional') as EmailTone, valueProposition: x.valueProposition })
      setStep(3)
    } catch (err) {
      setError(callErrorText(err, t.failed, t.network))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-labelledby="express-campaign-title" className="rounded-lg border border-accent/25 bg-raised p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 text-accent"><Zap className="h-4 w-4" aria-hidden="true" /></span>
        <h3 id="express-campaign-title" className="font-display text-sm font-bold text-ink">{t.title}</h3>
        <span className="font-mono text-xs text-quiet">{t.plan}</span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-quiet">{t.body}</p>

      {loading ? (
        <div role="status" aria-live="polite" className="flex h-12 items-center gap-3 rounded-md border border-accent/25 bg-canvas px-4">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
          <span className="font-mono text-xs text-ink/80">{t.stages[stage]}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-quiet" aria-hidden="true" />
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void launch() }}
              placeholder={t.urlPh}
              aria-label={t.urlLabel}
              className="h-12 w-full rounded-md border border-line bg-canvas pl-10 pr-4 text-sm text-ink outline-none transition-colors duration-200 ease-signal placeholder:text-quiet/60 focus:border-accent/50"
            />
          </div>
          <Button size="lg" onClick={() => void launch()} disabled={!url.trim()} className="h-12 px-5">
            {t.create}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-canvas px-3.5 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}
    </section>
  )
}
