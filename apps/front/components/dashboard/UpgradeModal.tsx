'use client'

import { useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import type { Plan } from '@prisma/client'
import { Dialog } from '@/components/ui/dialog'
import { buttonVariants } from '@/components/ui/button'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { cn } from '@/lib/utils'

type BillingCycle = 'monthly' | 'annual'
type OfferKey = 'PRO' | 'BUSINESS' | 'ENTERPRISE'

interface UpgradeModalProps {
  open:        boolean
  onClose:     () => void
  /** What the user was trying to do when they hit the limit */
  reason?:     'leads' | 'campaigns' | 'emails' | 'ai' | 'csv'
  currentPlan?: string
  current?:    number
  limit?:      number
  /**
   * Offers that have an annual Stripe price (PLAN_CONFIG[k].stripeAnnualPriceId
   * set), computed on the server: the price IDs come from server-only env
   * vars, so the browser cannot tell. Without it, only monthly prices show.
   */
  annualPlans?: readonly OfferKey[]
}

// ─── Copy ──────────────────────────────────────────────────────────────────

const REASON_COPY: Record<string, { title: string; description: string }> = {
  leads: {
    title:       "Vous avez atteint votre limite de leads",
    description: "Passez à la formule supérieure pour trouver plus de leads chaque mois.",
  },
  campaigns: {
    title:       'Limite de campagnes atteinte',
    description: 'Passez à la formule supérieure pour mener plusieurs campagnes en parallèle.',
  },
  emails: {
    title:       "Limite mensuelle d'e-mails atteinte",
    description: 'Passez à la formule supérieure pour continuer vos envois ce mois-ci.',
  },
  ai: {
    title:       'La rédaction IA est incluse dès la formule Pro',
    description: 'Passez à Pro pour faire rédiger et relire vos messages par l’IA.',
  },
  csv: {
    title:       "L'export CSV est inclus dès la formule Pro",
    description: 'Passez à Pro pour exporter vos leads vers vos autres outils.',
  },
}

// ─── Offers: prices from lib/stripe/plans.ts, perks checked against its features ──

interface Offer {
  key:          OfferKey
  description:  string
  perks:        string[]
  badge?:       string
  isHighlight?: boolean
}

const OFFERS: Offer[] = [
  {
    key:         'PRO',
    description: 'Pour les fondateurs qui lancent leur prospection.',
    perks: [
      '1 000 leads / mois',
      'Campagnes illimitées',
      '5 e-mails par séquence',
      'Rédaction IA et auto-critique',
      'Export CSV',
    ],
  },
  {
    key:          'BUSINESS',
    description:  'Pour les équipes commerciales qui passent à l’échelle.',
    badge:        'Recommandé',
    isHighlight:  true,
    perks: [
      '5 000 leads / mois',
      '7 e-mails par séquence',
      'Boîte de réponses et classification IA',
      'Séquences e-mail et LinkedIn',
      'Export des leads chauds pour votre CRM (CSV)',
    ],
  },
  {
    key:         'ENTERPRISE',
    description: 'Pour les équipes qui veulent un accompagnement sur mesure.',
    perks: [
      'Leads et e-mails illimités',
      'Séquences e-mail et LinkedIn',
      'Export des leads chauds pour votre CRM (CSV)',
      'Onboarding accompagné',
      'Support prioritaire',
    ],
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

/** 1430 shows as "1 430 €": French grouping, a no-break space before the euro sign. */
function euros(n: number): string {
  return `${n.toLocaleString('fr-FR')}\u00a0€`
}

function savings(key: OfferKey): { amount: number; pct: number } {
  const { price, annualPrice } = PLAN_CONFIG[key]
  const total = price * 12
  return {
    amount: total - annualPrice,
    pct:    total === 0 ? 0 : Math.round((1 - annualPrice / total) * 100),
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export function UpgradeModal({
  open,
  onClose,
  reason = 'leads',
  currentPlan = 'FREE',
  current,
  limit,
  annualPlans = [],
}: UpgradeModalProps) {
  const [billing, setBilling] = useState<BillingCycle>('annual')
  const copy = REASON_COPY[reason] ?? REASON_COPY.leads
  const hasAnnual = annualPlans.length > 0
  const cycle: BillingCycle = hasAnnual ? billing : 'monthly'
  const bestPct = Math.max(0, ...annualPlans.map((k) => savings(k).pct))
  const planName = currentPlan === 'FREE' ? 'gratuite' : (PLAN_CONFIG[currentPlan as Plan]?.name ?? currentPlan)

  return (
    <Dialog open={open} onClose={onClose} title={copy.title} description={copy.description} size="xl">
      {/* Quota progress bar (optional) */}
      {typeof current === 'number' && typeof limit === 'number' && (
        <div className="mx-auto mb-5 max-w-xs">
          <div className="mb-1 flex justify-between font-mono text-xs text-muted tabular-nums">
            <span>{current.toLocaleString('fr-FR')} utilisés</span>
            <span>limite {limit.toLocaleString('fr-FR')}, formule {planName}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-cyan"
              style={{ width: `${Math.min((current / limit) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Billing toggle: only when at least one offer is sold yearly */}
      {hasAnnual && (
        <div className="mb-5 flex items-center justify-center">
          <div
            role="group"
            aria-label="Périodicité de facturation"
            className="inline-flex rounded-md border border-border bg-void p-1"
          >
            <button
              type="button"
              aria-pressed={cycle === 'monthly'}
              onClick={() => setBilling('monthly')}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ease-signal sm:px-4',
                cycle === 'monthly' ? 'bg-white/[0.08] text-white' : 'text-muted hover:text-white',
              )}
            >
              Mensuel
            </button>
            <button
              type="button"
              aria-pressed={cycle === 'annual'}
              onClick={() => setBilling('annual')}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ease-signal sm:px-4',
                cycle === 'annual' ? 'bg-white/[0.08] text-white' : 'text-muted hover:text-white',
              )}
            >
              Annuel
              {bestPct > 0 && (
                <span className="rounded bg-success-fg/15 px-1.5 py-0.5 font-mono text-[11px] text-success-fg tabular-nums">
                  -{bestPct}&nbsp;%
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Offer cards: 1 column on mobile, 3 on desktop */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 sm:gap-4">
        {OFFERS.map((offer) => {
          const config   = PLAN_CONFIG[offer.key]
          const isAnnual = cycle === 'annual' && annualPlans.includes(offer.key)
          const price    = isAnnual ? Math.round(config.annualPrice / 12) : config.price
          const saved    = savings(offer.key)

          return (
            <article
              key={offer.key}
              className={cn(
                'relative flex flex-col rounded-[10px] border bg-void p-4 sm:p-5',
                offer.isHighlight ? 'border-cyan/50' : 'border-border',
              )}
            >
              {offer.badge && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-cyan px-2 py-0.5 font-mono text-[11px] font-semibold text-void">
                  {offer.badge}
                </div>
              )}

              <div className="mb-3">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-display text-sm font-bold text-white">{config.name}</h3>
                  {config.hasAiGeneration && (
                    <span className="rounded border border-cyan/25 px-1.5 py-0.5 font-mono text-[11px] text-cyan">IA</span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted">{offer.description}</p>
              </div>

              <div className="mb-1 flex flex-wrap items-baseline gap-x-1">
                <span className="font-mono text-2xl font-semibold text-white tabular-nums sm:text-3xl">
                  {euros(price)}
                </span>
                <span className="text-xs text-muted">
                  {isAnnual ? '/mois, facturé à l’année' : '/mois'}
                </span>
              </div>
              {isAnnual && saved.amount > 0 ? (
                <p className="mb-3 text-xs text-success-fg tabular-nums">
                  Économisez {euros(saved.amount)} par an, soit {saved.pct}&nbsp;%
                </p>
              ) : (
                <div className="mb-3" />
              )}

              <ul className="mb-5 flex-1 space-y-1.5">
                {offer.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-xs text-white/75">
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan" aria-hidden="true" />
                    <span className="leading-snug">{perk}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/dashboard/settings?tab=billing"
                onClick={onClose}
                className={buttonVariants({
                  variant: offer.isHighlight ? 'default' : 'outline',
                  size: 'sm',
                  className: 'w-full',
                })}
              >
                Choisir {config.name}
              </Link>
            </article>
          )
        })}
      </div>

      {/* Trust footer */}
      <div className="mt-5 flex flex-col items-center justify-center gap-2 text-xs text-muted sm:flex-row sm:gap-4">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Paiement sécurisé par Stripe
        </span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span>Sans engagement, résiliable à tout moment</span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span>Satisfait ou remboursé 14 jours</span>
      </div>
    </Dialog>
  )
}
