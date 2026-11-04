import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { Container } from '@/components/ui'
import { brand } from '@/lib/brand'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

export const metadata: Metadata = {
  title:       "Conditions d'utilisation",
  description: `Conditions générales d'utilisation et de vente de la plateforme ${brand.name}.`,
  robots:      { index: true, follow: true },
}

const LAST_UPDATED = '9 octobre 2026'
const PLAN_NAMES = (['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const).map((key) => PLAN_CONFIG[key].name).join(', ')

export default function TermsPage() {
  return (
    <>
      <Navbar />

      <main id="main-content">
        <Container className="pb-24 pt-20 md:pt-28">
        <div className="max-w-[46rem]">

          <header className="mb-12 border-b border-line pb-10">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-quiet">
              Legal · Terms of Service
            </span>
            <h1 className="mt-6 font-display text-[clamp(2.2rem,4.8vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-ink">
              Conditions d&apos;utilisation
            </h1>
            <p className="mt-4 font-mono text-xs text-quiet">Dernière mise à jour : {LAST_UPDATED}</p>
          </header>

          <article className="space-y-10">

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">1. Objet</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Les présentes conditions régissent l&apos;accès et l&apos;utilisation de la plateforme {brand.name}, un service
                logiciel en mode SaaS (Software as a Service) de prospection commerciale assistée par intelligence
                artificielle, opéré par {brand.legal.companyName}.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">2. Inscription et compte</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                L&apos;inscription au service requiert une adresse e-mail professionnelle valide. L&apos;utilisateur est
                responsable de la confidentialité de ses identifiants. Toute action effectuée depuis son compte
                est réputée provenir de lui.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">3. Abonnements et facturation</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                {brand.name} propose plusieurs formules d&apos;abonnement ({PLAN_NAMES}). Les paiements sont traités
                par Stripe. Les abonnements sont prélevés mensuellement ou annuellement, et reconduits tacitement
                jusqu&apos;à résiliation. La résiliation est possible à tout moment depuis l&apos;espace Paramètres et prend
                effet à la fin de la période en cours.
              </p>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Garantie satisfait ou remboursé : lors de votre première souscription à une formule payante, vous
                pouvez demander le remboursement intégral de ce premier paiement dans les 14 jours qui le suivent, par
                e-mail à l&apos;adresse de contact indiquée sur le site. Le remboursement est effectué sur le moyen de
                paiement utilisé, et l&apos;abonnement est alors résilié.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">4. Usage acceptable</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">L&apos;utilisateur s&apos;engage à :</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink/80 marker:text-accent">
                <li>Respecter les législations applicables, notamment le RGPD et la directive ePrivacy.</li>
                <li>Ne pas utiliser le service pour envoyer du spam, harceler ou contacter des personnes physiques sans base légale.</li>
                <li>Ne pas tenter d&apos;accéder aux données d&apos;autres utilisateurs, de bypass les limites techniques, ou d&apos;inverser le code.</li>
                <li>Maintenir à jour ses informations de facturation.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">5. Données utilisateurs</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Vous demeurez propriétaire des données importées dans {brand.name}. Vous nous concédez une licence
                non exclusive limitée à la fourniture du service. Notre traitement de ces données est régi par
                la <Link href="/legal/privacy" className="text-accent hover:underline">Politique de confidentialité</Link>.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">6. Disponibilité du service</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                {brand.name} s&apos;engage à fournir un service avec un objectif de disponibilité de 99,5%. Des interruptions
                planifiées pour maintenance peuvent survenir, notifiées par e-mail au moins 48 heures à l&apos;avance
                sauf urgence sécuritaire.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">7. Limitation de responsabilité</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                {brand.name} ne peut être tenue responsable des pertes commerciales indirectes, manques à gagner,
                pertes de données ou dommages immatériels. Notre responsabilité totale est en tout état de cause
                limitée aux 12 derniers mois de redevances payées par l&apos;utilisateur.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">8. Résiliation</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                L&apos;utilisateur peut résilier son abonnement à tout moment. {brand.name} se réserve le droit de
                suspendre ou résilier un compte en cas de violation des présentes conditions, après notification
                écrite et délai raisonnable de mise en conformité (sauf urgence).
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">9. Droit applicable</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Les présentes conditions sont régies par le droit français. Tout litige sera soumis aux tribunaux
                compétents du ressort du siège social de {brand.legal.companyName}, sauf disposition impérative contraire.
              </p>
            </section>

            <div className="mt-12 border-t border-line pt-8">
              <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à l&apos;accueil</Link>
            </div>
          </article>
        </div>
        </Container>
      </main>

      <Footer />
    </>
  )
}
