import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

export const metadata: Metadata = {
  title:       "Conditions d'utilisation",
  description: "Conditions générales d'utilisation et de vente de la plateforme Phantera.",
  robots:      { index: true, follow: true },
}

const LAST_UPDATED = '9 octobre 2026'
const PLAN_NAMES = (['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const).map((key) => PLAN_CONFIG[key].name).join(', ')

export default function TermsPage() {
  return (
    <>
      <Navbar />

      <main id="main-content">
        <div className="mx-auto max-w-[46rem] px-5 pb-24 pt-28 md:px-8 md:pt-36">

          <header className="mb-12 border-b border-border pb-10">
            <span className="font-mono text-sm text-muted">
              Legal · Terms of Service
            </span>
            <h1 className="mt-6 font-display text-[clamp(2.2rem,4.8vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-white">
              Conditions d'utilisation
            </h1>
            <p className="mt-4 font-mono text-xs text-muted">Dernière mise à jour : {LAST_UPDATED}</p>
          </header>

          <article className="prose-phantera space-y-10">

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">1. Objet</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                Les présentes conditions régissent l'accès et l'utilisation de la plateforme Phantera, un service
                logiciel en mode SaaS (Software as a Service) de prospection commerciale assistée par intelligence
                artificielle, opéré par Phantera SAS.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">2. Inscription et compte</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                L'inscription au service requiert une adresse e-mail professionnelle valide. L'utilisateur est
                responsable de la confidentialité de ses identifiants. Toute action effectuée depuis son compte
                est réputée provenir de lui.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">3. Abonnements et facturation</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                Phantera propose plusieurs formules d'abonnement ({PLAN_NAMES}). Les paiements sont traités
                par Stripe. Les abonnements sont prélevés mensuellement ou annuellement, et reconduits tacitement
                jusqu'à résiliation. La résiliation est possible à tout moment depuis l'espace Paramètres et prend
                effet à la fin de la période en cours.
              </p>
              <p className="mt-3 leading-[1.75] text-white/80">
                Garantie satisfait ou remboursé : lors de votre première souscription à une formule payante, vous
                pouvez demander le remboursement intégral de ce premier paiement dans les 14 jours qui le suivent, par
                e-mail à l'adresse de contact indiquée sur le site. Le remboursement est effectué sur le moyen de
                paiement utilisé, et l'abonnement est alors résilié.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">4. Usage acceptable</h2>
              <p className="mt-3 leading-[1.75] text-white/80">L'utilisateur s'engage à :</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-white/80 marker:text-cyan">
                <li>Respecter les législations applicables, notamment le RGPD et la directive ePrivacy.</li>
                <li>Ne pas utiliser le service pour envoyer du spam, harceler ou contacter des personnes physiques sans base légale.</li>
                <li>Ne pas tenter d'accéder aux données d'autres utilisateurs, de bypass les limites techniques, ou d'inverser le code.</li>
                <li>Maintenir à jour ses informations de facturation.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">5. Données utilisateurs</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                Vous demeurez propriétaire des données importées dans Phantera. Vous nous concédez une licence
                non exclusive limitée à la fourniture du service. Notre traitement de ces données est régi par
                la <Link href="/legal/privacy" className="text-cyan hover:underline">Politique de confidentialité</Link>.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">6. Disponibilité du service</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                Phantera s'engage à fournir un service avec un objectif de disponibilité de 99,5%. Des interruptions
                planifiées pour maintenance peuvent survenir, notifiées par e-mail au moins 48 heures à l'avance
                sauf urgence sécuritaire.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">7. Limitation de responsabilité</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                Phantera ne peut être tenue responsable des pertes commerciales indirectes, manques à gagner,
                pertes de données ou dommages immatériels. Notre responsabilité totale est en tout état de cause
                limitée aux 12 derniers mois de redevances payées par l'utilisateur.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">8. Résiliation</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                L'utilisateur peut résilier son abonnement à tout moment. Phantera se réserve le droit de
                suspendre ou résilier un compte en cas de violation des présentes conditions, après notification
                écrite et délai raisonnable de mise en conformité (sauf urgence).
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-white">9. Droit applicable</h2>
              <p className="mt-3 leading-[1.75] text-white/80">
                Les présentes conditions sont régies par le droit français. Tout litige sera soumis aux tribunaux
                compétents du ressort du siège social de Phantera SAS, sauf disposition impérative contraire.
              </p>
            </section>

            <div className="mt-12 border-t border-border/40 pt-8">
              <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-cyan hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à l'accueil</Link>
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </>
  )
}
