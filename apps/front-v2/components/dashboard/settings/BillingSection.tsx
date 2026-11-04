'use client'

/**
 * Paramètres › Facturation: current plan and usage, the plans (from
 * PLAN_CONFIG, never written twice), Stripe Checkout for the self-serve ones
 * and the customer portal once subscribed. Enterprise is sold by the team.
 */
import { useState } from 'react'
import { ArrowRight, Calendar, Check, CheckCircle2, CreditCard, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Badge, Button, Panel, buttonVariants } from '@/components/ui'
import { billingCopy as t } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import { track } from '@/lib/analytics/events'
import type { Plan, SettingsBilling } from '@/lib/front/types-settings'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { cn } from '@/lib/utils'

type BillingCycle = 'monthly' | 'annual'
type CheckoutPlan = 'PRO' | 'BUSINESS'

const SHOWN_PLANS: Plan[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']
const SELF_SERVE: Plan[] = ['PRO', 'BUSINESS']
const HIGHLIGHTED: Plan = 'BUSINESS'

/** French price: "49 €", "1 430 €" (non-breaking spaces). */
const euros = (n: number) => `${n.toLocaleString('fr-FR')}\u00a0€`
const fr = (n: number) => n.toLocaleString('fr-FR')

function UsageMeter({ label, current, limit }: { label: string; current: number; limit: number | null }) {
  const unlimited = limit === null || limit === Infinity
  const pct = unlimited ? 0 : Math.min((current / limit) * 100, 100)
  const tone = pct >= 90 ? { bar: 'bg-danger', text: 'text-danger' } : pct >= 60 ? { bar: 'bg-warning', text: 'text-ink' } : { bar: 'bg-success', text: 'text-ink' }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-xs text-quiet">{label}</span>
        <span className={cn('font-mono text-xs tabular-nums', unlimited ? 'text-ink' : tone.text)}>
          {unlimited ? t.unlimited(fr(current)) : `${fr(current)} / ${fr(limit)}`}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        role={unlimited ? undefined : 'meter'}
        aria-label={unlimited ? undefined : label}
        aria-valuemin={unlimited ? undefined : 0}
        aria-valuemax={unlimited ? undefined : limit}
        aria-valuenow={unlimited ? undefined : Math.min(current, limit)}
      >
        {!unlimited && (
          <div className={cn('h-full w-full origin-left rounded-full transition-transform duration-200 ease-signal', tone.bar)} style={{ transform: `scaleX(${pct / 100})` }} />
        )}
      </div>
      {!unlimited && pct >= 90 && (
        <p className="mt-1 font-mono text-[11px] text-danger">{current > limit ? t.over : current === limit ? t.reached : t.almost}</p>
      )}
    </div>
  )
}

function PlanCard({ planKey, billing, isCurrent, loading, onUpgrade }: {
  planKey: Plan
  billing: BillingCycle
  isCurrent: boolean
  loading: boolean
  onUpgrade: (plan: CheckoutPlan, billing: BillingCycle) => void
}) {
  const c = PLAN_CONFIG[planKey]
  const isEnterprise = planKey === 'ENTERPRISE'
  const purchasable = SELF_SERVE.includes(planKey)
  const highlight = planKey === HIGHLIGHTED
  // Annual: the monthly equivalent, for a fair comparison.
  const displayPrice = billing === 'annual' ? Math.round(c.annualPrice / 12) : c.price
  const savingsPct = c.price * 12 > 0 ? Math.round((1 - c.annualPrice / (c.price * 12)) * 100) : 0

  return (
    <article className={cn('flex h-full flex-col rounded-lg border bg-raised p-5', isCurrent ? 'border-accent' : 'border-line')}>
      <div className="mb-4">
        <div className="mb-3 flex min-h-[22px] flex-wrap items-center gap-2">
          {isCurrent && <Badge tone="signal">{t.currentBadge}</Badge>}
          {highlight && !isCurrent && <Badge tone="neutral">{t.recommended}</Badge>}
          {billing === 'annual' && purchasable && savingsPct > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-success">{`\u2212${savingsPct}\u00a0%`}</span>
          )}
        </div>
        <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{c.name}</h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-2xl font-semibold tabular-nums text-ink">{c.price === 0 ? t.free : euros(displayPrice)}</span>
          {c.price > 0 && <span className="font-mono text-xs text-quiet">{billing === 'annual' ? t.perMonthYearly : t.perMonth}</span>}
        </div>
        {billing === 'annual' && c.price > 0 && (
          <p className="mt-1 font-mono text-xs tabular-nums text-quiet">{t.perYear(euros(c.annualPrice))}</p>
        )}
      </div>

      <ul className="mb-5 flex-1 space-y-2 border-t border-line pt-4">
        {c.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="text-xs leading-relaxed text-quiet">{feature}</span>
          </li>
        ))}
      </ul>

      {isEnterprise && !isCurrent && (
        <a href={t.contactHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}>
          {t.contact}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      )}
      {purchasable && !isCurrent && (
        <Button
          size="sm"
          variant={highlight ? 'primary' : 'outline'}
          onClick={() => onUpgrade(planKey as CheckoutPlan, billing)}
          disabled={loading}
          aria-busy={loading || undefined}
          className="w-full"
        >
          {loading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t.redirecting}</>
            : <>{t.upgrade(c.name)} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></>}
        </Button>
      )}
      {isCurrent && <p className="rounded-md border border-line py-2 text-center font-mono text-xs text-quiet">{t.yourPlan}</p>}
      {!purchasable && !isEnterprise && !isCurrent && (
        <p className="rounded-md border border-dashed border-line py-2 text-center font-mono text-xs text-quiet">{t.freePlan}</p>
      )}
    </article>
  )
}

export function BillingSection({
  workspaceId, plan, stripeSubscriptionId, stripeCurrentPeriodEnd,
  campaignsUsed, campaignsLimit, leadsUsed, leadsLimit, annualPlans,
}: SettingsBilling) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [cycle, setCycle] = useState<BillingCycle>(annualPlans.length > 0 ? 'annual' : 'monthly')
  // Best yearly saving across the offers sold yearly.
  const bestAnnualPct = Math.max(0, ...annualPlans.map((k) => {
    const { price, annualPrice } = PLAN_CONFIG[k]
    return price * 12 === 0 ? 0 : Math.round((1 - annualPrice / (price * 12)) * 100)
  }))
  const renewDate = stripeCurrentPeriodEnd
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(stripeCurrentPeriodEnd))
    : null

  const handleUpgrade = async (target: CheckoutPlan, billing: BillingCycle) => {
    setLoadingPlan(target)
    setFlash(null)
    track('checkout_started', { plan: target, billing })
    try {
      const data = await api.call('stripe.checkout', { body: { plan: target, billing, workspaceId } })
      if (!data.url) { setFlash({ type: 'error', message: t.checkoutFailed }); return }
      window.location.href = data.url
    } catch (err) {
      setFlash({ type: 'error', message: err instanceof ApiError ? (err.body?.error ?? t.checkoutFailed) : t.checkoutNetwork })
    } finally {
      setLoadingPlan(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    setFlash(null)
    try {
      const data = await api.call('stripe.portal', { body: { workspaceId } })
      if (!data.url) { setFlash({ type: 'error', message: t.portalFailed }); return }
      window.location.href = data.url
    } catch (err) {
      setFlash({ type: 'error', message: err instanceof ApiError ? (err.body?.error ?? t.portalFailed) : t.portalNetwork })
    } finally {
      setPortalLoading(false)
    }
  }

  const cycleButton = (on: boolean) => cn(
    'rounded px-4 py-1.5 font-mono text-xs transition-colors duration-200 ease-signal',
    on ? 'bg-surface text-ink' : 'text-quiet hover:text-ink',
  )

  return (
    <div className="space-y-4">
      {flash && (
        <div
          role={flash.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-center gap-3 rounded-lg border bg-raised px-4 py-3 text-sm',
            flash.type === 'success' ? 'border-success/30 text-success' : 'border-danger/30 text-danger',
          )}
        >
          {flash.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            : <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {flash.message}
        </div>
      )}

      <Panel>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-quiet">{t.current}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">{PLAN_CONFIG[plan].name}</span>
              {plan !== 'FREE' && <Badge tone="success">{t.active}</Badge>}
            </div>
          </div>
          {renewDate && (
            <p className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-quiet">
              <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
              {t.renews(renewDate)}
            </p>
          )}
        </div>
        <div className="space-y-4">
          <p className="font-mono text-xs text-quiet">{t.usage}</p>
          <UsageMeter label={t.campaigns} current={campaignsUsed} limit={campaignsLimit} />
          <UsageMeter label={t.leads} current={leadsUsed} limit={leadsLimit} />
        </div>
      </Panel>

      {annualPlans.length > 0 && (
        <div className="flex justify-center">
          <div role="group" aria-label={t.cycle} className="inline-flex rounded-md border border-line bg-raised p-1">
            <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')} className={cycleButton(cycle === 'monthly')}>
              {t.monthly}
            </button>
            <button type="button" aria-pressed={cycle === 'annual'} onClick={() => setCycle('annual')} className={cycleButton(cycle === 'annual')}>
              {t.annual}
              {bestAnnualPct > 0 && <span className="ml-1.5 tabular-nums text-success">{`\u2212${bestAnnualPct}\u00a0%`}</span>}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SHOWN_PLANS.map((key) => (
          <PlanCard
            key={key}
            planKey={key}
            billing={cycle === 'annual' && (annualPlans as readonly string[]).includes(key) ? 'annual' : 'monthly'}
            isCurrent={plan === key}
            loading={loadingPlan === key}
            onUpgrade={(p, b) => void handleUpgrade(p, b)}
          />
        ))}
      </div>

      {stripeSubscriptionId && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
                <CreditCard className="h-4 w-4 text-quiet" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{t.manageTitle}</p>
                <p className="mt-0.5 text-xs text-quiet">{t.manageBody}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handlePortal()} disabled={portalLoading} aria-busy={portalLoading || undefined}>
              {portalLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
              {t.portal}
            </Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
