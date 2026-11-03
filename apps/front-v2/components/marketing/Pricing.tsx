import Link from 'next/link'
import { Check } from 'lucide-react'
import { buttonVariants, Section } from '@/components/ui'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { cn } from '@/lib/utils'
import { anchorLabel, landing } from '@/lib/content'

// Server Component: the monthly / annual switch is two native radios and CSS
// (globals.css, `.pricing:has(#cycle-monthly:checked)`). No client code.
// Prices come from PLAN_CONFIG (the chassis' source of truth), texts from content.
const BILLING = `/sign-in?redirect_url=${encodeURIComponent('/dashboard/settings?tab=billing')}`

const PLANS = [
  { id: 'free', config: PLAN_CONFIG.FREE, href: '/sign-up' },
  { id: 'pro', config: PLAN_CONFIG.PRO, href: BILLING },
  { id: 'business', config: PLAN_CONFIG.BUSINESS, href: BILLING, recommended: true },
  { id: 'enterprise', config: PLAN_CONFIG.ENTERPRISE, href: BILLING },
] as const

const euros = (n: number) => `${n.toLocaleString('fr-FR')} €`
const price = 'font-display text-4xl font-semibold tracking-[-0.03em] text-ink'
const tab = 'cursor-pointer rounded px-4 py-2 text-sm text-quiet transition-colors duration-200 hover:text-ink'

export function Pricing() {
  const t = landing.pricing
  return (
    <Section id="pricing" index={3} eyebrow={anchorLabel('#pricing')} title={t.title} intro={t.subtitle} className="pricing">
      <fieldset className="mt-10 inline-flex rounded-md border border-line p-1">
        <legend className="sr-only">{t.cycleLegend}</legend>
        <input type="radio" name="cycle" id="cycle-monthly" value="monthly" className="peer/m sr-only" />
        <label htmlFor="cycle-monthly" className={cn(tab, 'peer-checked/m:bg-surface-2 peer-checked/m:text-ink peer-focus-visible/m:outline peer-focus-visible/m:outline-2 peer-focus-visible/m:outline-accent')}>
          {t.monthly}
        </label>
        <input type="radio" name="cycle" id="cycle-annual" value="annual" defaultChecked className="peer/a sr-only" />
        <label htmlFor="cycle-annual" className={cn(tab, 'peer-checked/a:bg-surface-2 peer-checked/a:text-ink peer-focus-visible/a:outline peer-focus-visible/a:outline-2 peer-focus-visible/a:outline-accent')}>
          {t.annual} <span className="ml-1 font-mono text-xs text-signal">{t.annualBadge}</span>
        </label>
      </fieldset>

      <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const text = t.plans[plan.id]
          if (!text) return null
          const recommended = 'recommended' in plan && plan.recommended
          const { price: monthly, annualPrice: annual } = plan.config
          const titleId = `plan-${plan.id}`
          return (
            <article key={plan.id} aria-labelledby={titleId} className={cn('relative flex flex-col p-6 md:p-7', recommended ? 'bg-raised' : 'bg-canvas')}>
              {recommended && <span className="absolute inset-x-0 top-0 h-0.5 bg-signal" aria-hidden="true" />}
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={titleId} className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">{text.name}</h3>
                {recommended && <span className="font-mono text-xs text-signal">{t.recommended}</span>}
              </div>
              <p className="mt-2 min-h-[2.75rem] text-sm leading-snug text-quiet">{text.description}</p>
              <div className="mt-6 min-h-[5.5rem]">
                {monthly === 0 ? (
                  <>
                    <p className={price}>{euros(0)}</p>
                    <p className="mt-2 text-sm text-quiet">{t.freeForever}</p>
                  </>
                ) : (
                  <>
                    <div className="price-annual">
                      <p className={price}>{euros(Math.round(annual / 12))}</p>
                      <p className="mt-2 text-sm text-quiet">{t.perMonthBilledAnnually}</p>
                      <p className="mt-1 font-mono text-xs text-signal">{euros(monthly * 12 - annual)} {t.savedPerYear}</p>
                    </div>
                    <div className="price-monthly">
                      <p className={price}>{euros(monthly)}</p>
                      <p className="mt-2 text-sm text-quiet">{t.perMonthNoCommitment}</p>
                    </div>
                  </>
                )}
              </div>
              <Link href={plan.href} className={buttonVariants({ variant: recommended ? 'primary' : 'outline', className: 'mt-6 w-full' })}>
                {text.cta}
              </Link>
              <ul aria-label={`${t.includedIn} ${text.name}`} className="mt-8 grid gap-3 text-sm text-quiet">
                {text.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
      <p className="mt-6 text-sm text-quiet">{t.footnote}</p>
    </Section>
  )
}
