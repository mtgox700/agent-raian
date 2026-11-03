'use client'

/**
 * The offers, shown when a quota is reached or a paid feature is tried
 * (CSV export, advanced search filters). Prices come from lib/stripe/plans;
 * the annual cycle only for offers that have an annual Stripe price.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Check, ShieldCheck } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { upgradeCopy as t, type UpgradeReason } from '@/lib/copy/leads'
import type { AnnualPlan } from '@/lib/front/types-leads'

type BillingCycle = 'monthly' | 'annual'

function savings(key: AnnualPlan): { amount: number; pct: number } {
  const { price, annualPrice } = PLAN_CONFIG[key]
  const total = price * 12
  return { amount: total - annualPrice, pct: total === 0 ? 0 : Math.round((1 - annualPrice / total) * 100) }
}

export function UpgradeModal({ open, onClose, reason = 'leads', annualPlans = [] }: {
  open: boolean
  onClose: () => void
  /** What the user was trying to do when they hit the limit. */
  reason?: UpgradeReason
  /** Offers with an annual Stripe price (computed on the server). */
  annualPlans?: readonly AnnualPlan[]
}) {
  const [billing, setBilling] = useState<BillingCycle>('annual')
  const copy = t.reasons[reason] ?? t.reasons.leads
  const hasAnnual = annualPlans.length > 0
  const cycle: BillingCycle = hasAnnual ? billing : 'monthly'
  const bestPct = Math.max(0, ...annualPlans.map((k) => savings(k).pct))

  const cycleButton = (value: BillingCycle, children: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={cycle === value}
      onClick={() => setBilling(value)}
      className={cn(
        'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors duration-200 ease-signal sm:px-4',
        cycle === value ? 'bg-surface text-ink' : 'text-quiet hover:text-ink',
      )}
    >
      {children}
    </button>
  )

  return (
    <Dialog open={open} onClose={onClose} title={copy.title} description={copy.description} closeLabel={t.close} size="lg" className="max-w-4xl">
      {hasAnnual && (
        <div className="mb-5 flex items-center justify-center">
          <div role="group" aria-label={t.cycleLabel} className="inline-flex rounded-md border border-line bg-canvas p-1">
            {cycleButton('monthly', t.monthly)}
            {cycleButton('annual', <>
              {t.annual}
              {bestPct > 0 && <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-success">{t.bestPct(bestPct)}</span>}
            </>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        {t.offers.map((offer) => {
          const config = PLAN_CONFIG[offer.key]
          const isAnnual = cycle === 'annual' && annualPlans.includes(offer.key)
          const price = isAnnual ? Math.round(config.annualPrice / 12) : config.price
          const saved = savings(offer.key)
          const highlight = 'highlight' in offer && offer.highlight

          return (
            <article key={offer.key} className={cn('relative flex flex-col rounded-lg border bg-canvas p-4 sm:p-5', highlight ? 'border-accent/60' : 'border-line')}>
              {'badge' in offer && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-accent px-2 py-0.5 font-mono text-[11px] text-canvas">
                  {offer.badge}
                </span>
              )}
              <div className="mb-3">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">{config.name}</h3>
                  {config.hasAiGeneration && <span className="rounded border border-ai/40 px-1.5 py-0.5 font-mono text-[11px] text-ai">{t.ai}</span>}
                </div>
                <p className="text-sm leading-relaxed text-quiet">{offer.description}</p>
              </div>

              <div className="mb-1 flex flex-wrap items-baseline gap-x-1">
                <span className="font-display text-3xl font-semibold tabular-nums tracking-[-0.03em] text-ink">{t.euros(price)}</span>
                <span className="text-xs text-quiet">{isAnnual ? t.perMonthAnnual : t.perMonth}</span>
              </div>
              {isAnnual && saved.amount > 0
                ? <p className="mb-3 text-xs tabular-nums text-success">{t.save(t.euros(saved.amount), saved.pct)}</p>
                : <div className="mb-3" />}

              <ul className="mb-5 flex-1 space-y-1.5">
                {offer.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-ink">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="leading-snug">{perk}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={t.billingHref}
                onClick={onClose}
                className={cn(buttonVariants({ variant: highlight ? 'primary' : 'outline', size: 'sm' }), 'w-full')}
              >
                {t.choose(config.name)}
              </Link>
            </article>
          )
        })}
      </div>

      <div className="mt-5 flex flex-col items-center justify-center gap-2 text-xs text-quiet sm:flex-row sm:gap-4">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t.secure}
        </span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span>{t.noCommitment}</span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span>{t.refund}</span>
      </div>
    </Dialog>
  )
}
