'use client'

import { Check, ArrowRight, Loader2 } from 'lucide-react'
import type { Plan } from '@prisma/client'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

type BillingCycle = 'monthly' | 'annual'
type PurchasablePlan = 'PRO' | 'BUSINESS' | 'ENTERPRISE'

interface PlanInfo {
  key:             Plan
  name:            string
  price:           number   // monthly price
  annualPrice:     number   // annual price (yearly, post -20%)
  features:        string[]
  hasAiGeneration: boolean
  isPurchasable:   boolean
  highlight?:      boolean  // visually feature this card as recommended
}

interface PlanCardProps {
  plan:           PlanInfo
  billing:        BillingCycle
  isCurrentPlan:  boolean
  onUpgrade:      (plan: PurchasablePlan, billing: BillingCycle) => void
  isLoading?:     boolean
}

/** French price: "49 €", "1 430 €" (non-breaking spaces). */
function euros(n: number): string {
  return `${n.toLocaleString('fr-FR')}\u00a0€`
}

export function PlanCard({ plan, billing, isCurrentPlan, onUpgrade, isLoading }: PlanCardProps) {
  const isEnterprise = plan.key === 'ENTERPRISE'

  // Annual: show the monthly equivalent for a fair comparison.
  const displayPrice = billing === 'annual'
    ? Math.round(plan.annualPrice / 12)
    : plan.price
  const cycleLabel = billing === 'annual' ? 'par mois, facturé à l’année' : 'par mois'

  const monthlyTotal     = plan.price * 12
  const annualSavingsPct = monthlyTotal > 0
    ? Math.round((1 - plan.annualPrice / monthlyTotal) * 100)
    : 0

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-[10px] border bg-obsidian p-5',
        isCurrentPlan ? 'border-cyan' : 'border-border',
      )}
    >
      {/* Header */}
      <div className="mb-4">
        <div className="mb-3 flex min-h-[22px] flex-wrap items-center gap-2">
          {isCurrentPlan && <StatusBadge tone="signal">Offre en cours</StatusBadge>}
          {plan.highlight && !isCurrentPlan && <StatusBadge tone="neutral">Recommandée</StatusBadge>}
          {billing === 'annual' && plan.isPurchasable && annualSavingsPct > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-success-fg">
              {`\u2212${annualSavingsPct}\u00a0%`}
            </span>
          )}
        </div>

        <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-white">{plan.name}</h3>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums text-white">
            {plan.price === 0 ? 'Gratuit' : euros(displayPrice)}
          </span>
          {plan.price > 0 && (
            <span className="font-mono text-xs text-muted">{cycleLabel}</span>
          )}
        </div>
        {billing === 'annual' && plan.price > 0 && (
          <p className="mt-1 font-mono text-xs tabular-nums text-muted">
            soit {euros(plan.annualPrice)} par an
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="mb-5 flex-1 space-y-2 border-t border-border pt-4">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan" aria-hidden="true" />
            <span className="text-xs text-muted">{feature}</span>
          </li>
        ))}
      </ul>

      {/* Action */}
      {isEnterprise && !isCurrentPlan && (
        <a
          href={`mailto:contact@${brand.domain}?subject=${encodeURIComponent(`Formule Enterprise ${brand.name}`)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full gap-2')}
        >
          Contacter l&apos;équipe
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      )}
      {plan.isPurchasable && !isCurrentPlan && (
        <Button
          size="sm"
          variant={plan.highlight ? 'default' : 'outline'}
          onClick={() => onUpgrade(plan.key as PurchasablePlan, billing)}
          disabled={isLoading}
          aria-busy={isLoading || undefined}
          className="w-full gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
              Redirection vers le paiement
            </>
          ) : (
            <>
              Passer à {plan.name}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      )}

      {isCurrentPlan && (
        <p className="rounded-md border border-border py-2 text-center font-mono text-xs text-muted">
          Votre offre actuelle
        </p>
      )}

      {!plan.isPurchasable && !isEnterprise && !isCurrentPlan && (
        <p className="rounded-md border border-dashed border-border py-2 text-center font-mono text-xs text-muted">
          Offre gratuite
        </p>
      )}
    </div>
  )
}
