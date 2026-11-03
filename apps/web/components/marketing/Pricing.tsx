// Server Component: the monthly / annual switch is two native radio inputs
// and CSS (`.pricing:has(#cycle-monthly:checked)`), so prices switch without
// JavaScript and the section ships no client code.
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button-variants'

// After sign-in, Clerk redirects to this URL
const BILLING_REDIRECT = '/dashboard/settings?tab=billing'
const BILLING_REDIRECT_ENCODED = encodeURIComponent(BILLING_REDIRECT)

interface PlanDisplay {
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
// are the founder's decision, not the design's.
const PLANS: PlanDisplay[] = [
  {
    name: 'Gratuit',
    monthly: 0,
    annual: 0,
    description: 'Explorez la plateforme, sans carte bancaire.',
    features: [
      '100 leads / mois',
      '1 campagne active',
      '3 e-mails par séquence',
      '1 utilisateur',
      '1 boîte d\'envoi',
      'Statistiques essentielles',
      'Support communautaire',
    ],
    cta: 'Commencer gratuitement',
    href: '/sign-up',
  },
  {
    name: 'Pro',
    monthly: 49,
    annual: 470,
    description: 'Pour les fondateurs qui lancent leur prospection.',
    features: [
      '1 000 leads / mois',
      'Campagnes illimitées',
      '5 e-mails par séquence',
      '1 utilisateur',
      '1 boîte d\'envoi',
      'Génération IA avec auto-critique',
      'Statistiques avancées',
      'Export CSV',
    ],
    cta: 'Choisir Pro',
    href: `/sign-in?redirect_url=${BILLING_REDIRECT_ENCODED}`,
  },
  {
    name: 'Business',
    monthly: 149,
    annual: 1430,
    description: 'Pour les équipes commerciales qui passent à l\'échelle.',
    features: [
      '5 000 leads / mois',
      'Campagnes illimitées',
      '7 e-mails par séquence',
      '3 utilisateurs : rôles, chacun ses campagnes',
      '3 boîtes d\'envoi, une boîte ou un alias par campagne',
      'Génération IA avec auto-critique',
      'Campagne express : votre site devient une campagne',
      'Conseiller ICP : l\'IA recommande qui cibler',
      'Boîte de réponses + classification IA',
      'Séquences e-mail et LinkedIn',
      'Export des leads chauds pour votre CRM (CSV)',
      'Support prioritaire par e-mail',
    ],
    cta: 'Choisir Business',
    href: `/sign-in?redirect_url=${BILLING_REDIRECT_ENCODED}`,
    recommended: true,
  },
  {
    name: 'Entreprise',
    monthly: 500,
    annual: 4800,
    description: 'Pour les scale-ups qui veulent tout, sans limite.',
    features: [
      'Leads illimités',
      'Campagnes illimitées',
      '10 e-mails par séquence',
      'Utilisateurs illimités : admins, membres, lecture seule',
      'Boîtes d\'envoi illimitées, une boîte ou un alias par campagne',
      'Génération IA avec auto-critique',
      'Campagne express + Conseiller ICP IA',
      'Séquences e-mail et LinkedIn',
      'Export des leads chauds pour votre CRM (CSV)',
      'Onboarding accompagné',
      'Support prioritaire',
    ],
    cta: 'Contacter l\'équipe',
    href: `/sign-in?redirect_url=${BILLING_REDIRECT_ENCODED}`,
  },
]

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
              Des tarifs simples.
            </h2>
            <p className="mt-4 text-muted">Sans frais cachés, sans engagement, annulable à tout moment.</p>
          </div>

          <fieldset className="inline-flex self-start rounded-md border border-border p-1 md:self-auto">
            <legend className="sr-only">Cycle de facturation</legend>
            <input type="radio" name="cycle" id="cycle-monthly" value="monthly" className="peer/m sr-only" />
            <label
              htmlFor="cycle-monthly"
              className="cursor-pointer rounded-[4px] px-4 py-2 text-sm text-muted transition-colors duration-200 hover:text-white peer-checked/m:bg-surface-2 peer-checked/m:text-white peer-focus-visible/m:outline peer-focus-visible/m:outline-2 peer-focus-visible/m:outline-cyan"
            >
              Mensuel
            </label>
            <input type="radio" name="cycle" id="cycle-annual" value="annual" defaultChecked className="peer/a sr-only" />
            <label
              htmlFor="cycle-annual"
              className="cursor-pointer rounded-[4px] px-4 py-2 text-sm text-muted transition-colors duration-200 hover:text-white peer-checked/a:bg-surface-2 peer-checked/a:text-white peer-focus-visible/a:outline peer-focus-visible/a:outline-2 peer-focus-visible/a:outline-cyan"
            >
              Annuel <span className="ml-1 font-mono text-xs text-gold">−20 %</span>
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
                {plan.recommended && <span className="font-mono text-xs text-gold">Recommandé</span>}
              </div>
              <p className="mt-2 min-h-[2.75rem] text-sm leading-snug text-muted">{plan.description}</p>

              {/* Fixed height: every plan's button sits on the same line. */}
              <div className="mt-6 min-h-[5.5rem]">
                {plan.monthly === 0 ? (
                  <>
                    <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white">0 €</p>
                    <p className="mt-2 text-sm text-muted">pour toujours</p>
                  </>
                ) : (
                  <>
                    <div className="price-annual">
                      <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white">
                        {euros(Math.round(plan.annual / 12))}
                      </p>
                      <p className="mt-2 text-sm text-muted">par mois, facturé à l&apos;année</p>
                      <p className="mt-1 font-mono text-xs text-gold">{euros(savings(plan))} économisés par an</p>
                    </div>
                    <div className="price-monthly">
                      <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white">{euros(plan.monthly)}</p>
                      <p className="mt-2 text-sm text-muted">par mois, sans engagement</p>
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

              <ul className="mt-8 space-y-2.5" aria-label={`Inclus dans ${plan.name}`}>
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
          Prix en euros hors TVA. Satisfait ou remboursé pendant 14 jours.
        </p>
      </div>
    </section>
  )
}
