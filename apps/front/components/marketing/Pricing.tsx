// Server Component: the monthly / annual switch is two native radio inputs
// and CSS (`.pricing:has(#cycle-monthly:checked)`), so prices switch without
// JavaScript and the section ships no client code.
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button-variants'
import { landing } from '@/lib/marketing/content'

// After sign-in, Clerk redirects to this URL
const BILLING_REDIRECT = '/dashboard/settings?tab=billing'
const BILLING_REDIRECT_ENCODED = encodeURIComponent(BILLING_REDIRECT)

type PlanId = 'free' | 'pro' | 'business' | 'enterprise'

interface PlanDisplay {
  id: PlanId
  name: string
  monthly: number // EUR per month
  annual: number  // EUR per year (post -20%)
  description: string
  features: string[]
  cta: string
  href: string
  recommended?: boolean
}

// Prices, limits and features are unchanged from the previous design: they
// are the founder's decision, not the design's. Texts (name, description,
// features, button) live in packages/content/content/<brand>/<locale>/landing.json.
const PLAN_PRICES: Omit<PlanDisplay, 'name' | 'description' | 'features' | 'cta'>[] = [
  { id: 'free',       monthly: 0,   annual: 0,    href: '/sign-up' },
  { id: 'pro',        monthly: 49,  annual: 470,  href: `/sign-in?redirect_url=${BILLING_REDIRECT_ENCODED}` },
  { id: 'business',   monthly: 149, annual: 1430, href: `/sign-in?redirect_url=${BILLING_REDIRECT_ENCODED}`, recommended: true },
  { id: 'enterprise', monthly: 500, annual: 4800, href: `/sign-in?redirect_url=${BILLING_REDIRECT_ENCODED}` },
]

const t = landing.pricing

const PLANS: PlanDisplay[] = PLAN_PRICES.map((plan) => ({ ...plan, ...t.plans[plan.id] }))

const euros = (n: number) => `${n.toLocaleString('fr-FR')} €`

function savings(plan: PlanDisplay): number {
  return plan.monthly * 12 - plan.annual
}

export function Pricing() {
  return (
    <section id="pricing" className="pricing border-b border-border py-24 md:py-32" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="pricing-title" className="font-display text-[clamp(2rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
              {t.title}
            </h2>
            <p className="mt-4 text-muted">{t.subtitle}</p>
          </div>

          <fieldset className="inline-flex self-start rounded-md border border-border p-1 md:self-auto">
            <legend className="sr-only">{t.cycleLegend}</legend>
            <input type="radio" name="cycle" id="cycle-monthly" value="monthly" className="peer/m sr-only" />
            <label
              htmlFor="cycle-monthly"
              className="cursor-pointer rounded-[4px] px-4 py-2 text-sm text-muted transition-colors duration-200 hover:text-white peer-checked/m:bg-surface-2 peer-checked/m:text-white peer-focus-visible/m:outline peer-focus-visible/m:outline-2 peer-focus-visible/m:outline-cyan"
            >
              {t.monthly}
            </label>
            <input type="radio" name="cycle" id="cycle-annual" value="annual" defaultChecked className="peer/a sr-only" />
            <label
              htmlFor="cycle-annual"
              className="cursor-pointer rounded-[4px] px-4 py-2 text-sm text-muted transition-colors duration-200 hover:text-white peer-checked/a:bg-surface-2 peer-checked/a:text-white peer-focus-visible/a:outline peer-focus-visible/a:outline-2 peer-focus-visible/a:outline-cyan"
            >
              {t.annual} <span className="ml-1 font-mono text-xs text-gold">{t.annualBadge}</span>
            </label>
          </fieldset>
        </div>

        <div className="mt-12 grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan, i) => (
            <article
              key={plan.name}
              className={cn(
                'relative flex flex-col border-b border-border py-8 sm:px-6',
                i % 2 === 1 && 'sm:border-l',
                i > 0 && 'lg:border-l',
                i === 0 && 'sm:pl-0',
                plan.recommended && '-mx-5 bg-surface/60 px-5 sm:mx-0 sm:px-6',
              )}
              aria-labelledby={`plan-${plan.name}`}
            >
              {plan.recommended && <span className="absolute inset-x-0 top-[-1px] h-px bg-gold" aria-hidden="true" />}
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={`plan-${plan.name}`} className="font-display text-xl font-semibold tracking-[-0.02em] text-white">
                  {plan.name}
                </h3>
                {plan.recommended && <span className="font-mono text-xs text-gold">{t.recommended}</span>}
              </div>
              <p className="mt-2 min-h-[2.75rem] text-sm leading-snug text-muted">{plan.description}</p>

              {/* Fixed height: every plan's button sits on the same line. */}
              <div className="mt-6 min-h-[5.5rem]">
                {plan.monthly === 0 ? (
                  <>
                    <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white">0 €</p>
                    <p className="mt-2 text-sm text-muted">{t.freeForever}</p>
                  </>
                ) : (
                  <>
                    <div className="price-annual">
                      <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white">
                        {euros(Math.round(plan.annual / 12))}
                      </p>
                      <p className="mt-2 text-sm text-muted">{t.perMonthBilledAnnually}</p>
                      <p className="mt-1 font-mono text-xs text-gold">{euros(savings(plan))} {t.savedPerYear}</p>
                    </div>
                    <div className="price-monthly">
                      <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white">{euros(plan.monthly)}</p>
                      <p className="mt-2 text-sm text-muted">{t.perMonthNoCommitment}</p>
                    </div>
                  </>
                )}
              </div>

              <Link
                href={plan.href}
                className={cn(
                  buttonVariants({ variant: plan.recommended ? 'default' : 'outline' }),
                  'mt-8 w-full',
                )}
              >
                {plan.cta}
              </Link>

              <ul className="mt-8 space-y-2.5" aria-label={`${t.includedIn} ${plan.name}`}>
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm leading-snug text-white/80">
                    <span className="mt-[9px] h-px w-2.5 shrink-0 bg-cyan" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="mt-8 font-mono text-xs text-muted">
          {t.footnote}
        </p>
      </div>
    </section>
  )
}
