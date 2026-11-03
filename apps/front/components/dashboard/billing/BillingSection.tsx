'use client'

import { useState } from 'react'
import { ExternalLink, CheckCircle2, XCircle, CreditCard, Loader2 } from 'lucide-react'
import { BillingOverview } from './BillingOverview'
import { PlanCard } from './PlanCard'
import { track } from '@/lib/analytics/events'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Plan } from '@prisma/client'

type BillingCycle = 'monthly' | 'annual'

// Plans shown on this page, derived from PLAN_CONFIG (lib/stripe/plans.ts):
// prices, names and features are never written twice. Enterprise is sold by
// the team (contract, onboarding), never through self-serve checkout.
const SHOWN_PLANS: Plan[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']
const SELF_SERVE: Plan[]  = ['PRO', 'BUSINESS']
const HIGHLIGHTED: Plan   = 'BUSINESS'

const PLAN_LIST = SHOWN_PLANS.map((key) => {
  const c = PLAN_CONFIG[key]
  return {
    key,
    name:            c.name,
    price:           c.price,
    annualPrice:     c.annualPrice,
    isPurchasable:   SELF_SERVE.includes(key),
    hasAiGeneration: c.hasAiGeneration,
    highlight:       key === HIGHLIGHTED,
    features:        c.features,
  }
})

interface BillingSectionProps {
  workspaceId: string
  plan: Plan
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeCurrentPeriodEnd: Date | null
  campaignsUsed: number
  campaignsLimit: number | null
  leadsUsed: number
  leadsLimit: number | null
  /** Offers with an annual price in Stripe (read on the server). Empty: monthly only. */
  annualPlans?: readonly ('PRO' | 'BUSINESS' | 'ENTERPRISE')[]
}

export function BillingSection({
  workspaceId,
  plan,
  stripeCustomerId: _stripeCustomerId,
  stripeSubscriptionId,
  stripeCurrentPeriodEnd,
  campaignsUsed,
  campaignsLimit,
  leadsUsed,
  leadsLimit,
  annualPlans = [],
}: BillingSectionProps) {
  const [loadingPlan, setLoadingPlan]     = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [flash, setFlash]                 = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [billingCycle, setBillingCycle]   = useState<BillingCycle>(annualPlans.length > 0 ? 'annual' : 'monthly') // annual first when it exists
  // Best yearly saving across the offers sold yearly, from PLAN_CONFIG (as in UpgradeModal).
  const bestAnnualPct = Math.max(0, ...annualPlans.map((k) => {
    const { price, annualPrice } = PLAN_CONFIG[k]
    const total = price * 12
    return total === 0 ? 0 : Math.round((1 - annualPrice / total) * 100)
  }))

  const handleUpgrade = async (targetPlan: 'PRO' | 'BUSINESS' | 'ENTERPRISE', billing: BillingCycle) => {
    setLoadingPlan(targetPlan)
    setFlash(null)

    track('checkout_started', { plan: targetPlan, billing })

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan, billing, workspaceId }),
      })

      const data = await res.json() as { url?: string; error?: string }

      if (!res.ok || !data.url) {
        setFlash({
          type: 'error',
          message: data.error ?? 'Impossible de créer la session de paiement. Réessayez.',
        })
        return
      }

      window.location.href = data.url
    } catch {
      setFlash({ type: 'error', message: 'Erreur réseau. Vérifiez votre connexion et réessayez.' })
    } finally {
      setLoadingPlan(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    setFlash(null)

    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })

      const data = await res.json() as { url?: string; error?: string }

      if (!res.ok || !data.url) {
        setFlash({ type: 'error', message: data.error ?? "Impossible d'ouvrir le portail." })
        return
      }

      window.location.href = data.url
    } catch {
      setFlash({ type: 'error', message: 'Erreur réseau. Réessayez.' })
    } finally {
      setPortalLoading(false)
    }
  }

  const tabClass = (on: boolean) => cn(
    'rounded-md px-4 py-1.5 font-mono text-xs transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan',
    on ? 'bg-surface text-white' : 'text-muted hover:text-white',
  )

  return (
    <div className="space-y-4">
      {/* Flash message */}
      {flash && (
        <div
          role={flash.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-center gap-3 rounded-[10px] border bg-obsidian px-4 py-3 text-sm',
            flash.type === 'success' ? 'border-success-fg/25 text-success-fg' : 'border-danger/25 text-danger',
          )}
        >
          {flash.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          )}
          {flash.message}
        </div>
      )}

      {/* Usage overview */}
      <BillingOverview
        plan={plan}
        stripeCurrentPeriodEnd={stripeCurrentPeriodEnd}
        campaignsUsed={campaignsUsed}
        campaignsLimit={campaignsLimit}
        leadsUsed={leadsUsed}
        leadsLimit={leadsLimit}
      />

      {/* Billing cycle toggle: only when an annual price exists in Stripe */}
      {annualPlans.length > 0 && (
      <div className="flex items-center justify-center">
        <div
          role="group"
          aria-label="Cycle de facturation"
          className="inline-flex rounded-md border border-border bg-obsidian p-1"
        >
          <button
            type="button"
            aria-pressed={billingCycle === 'monthly'}
            onClick={() => setBillingCycle('monthly')}
            className={tabClass(billingCycle === 'monthly')}
          >
            Mensuel
          </button>
          <button
            type="button"
            aria-pressed={billingCycle === 'annual'}
            onClick={() => setBillingCycle('annual')}
            className={tabClass(billingCycle === 'annual')}
          >
            Annuel
            {bestAnnualPct > 0 && (
              <span className="ml-1.5 tabular-nums text-success-fg">{`\u2212${bestAnnualPct}\u00a0%`}</span>
            )}
          </button>
        </div>
      </div>
      )}

      {/* Plan cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_LIST.map((planInfo) => (
          <PlanCard
            key={planInfo.key}
            plan={planInfo}
            billing={billingCycle === 'annual' && (annualPlans as readonly string[]).includes(planInfo.key) ? 'annual' : 'monthly'}
            isCurrentPlan={plan === planInfo.key}
            onUpgrade={handleUpgrade}
            isLoading={loadingPlan === planInfo.key}
          />
        ))}
      </div>

      {/* Manage subscription: only shown when subscribed */}
      {stripeSubscriptionId && (
        <div className="rounded-[10px] border border-border bg-obsidian p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-surface">
                <CreditCard className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Gérer votre abonnement</p>
                <p className="mt-0.5 text-xs text-muted">
                  Changez d&apos;offre, mettez à jour votre moyen de paiement ou résiliez.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handlePortal}
              disabled={portalLoading}
              aria-busy={portalLoading || undefined}
              className="flex-shrink-0 gap-2"
            >
              {portalLoading ? (
                <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Portail de facturation
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
