import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { Container } from '@/components/ui'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title:       'Politique de confidentialité',
  description: `Comment ${brand.name} collecte, utilise et protège vos données personnelles.`,
  robots:      { index: true, follow: true },
}

const LAST_UPDATED = '6 octobre 2026'

export default function PrivacyPolicyPage() {
  return (
    <>
      <Navbar />

      <main id="main-content">
        <Container className="pb-24 pt-20 md:pt-28">
        <div className="max-w-[46rem]">

          <header className="mb-12 border-b border-line pb-10">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-quiet">
              Legal · GDPR-compliant
            </span>
            <h1 className="mt-6 font-display text-[clamp(2.2rem,4.8vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-ink">
              Politique de confidentialité
            </h1>
            <p className="mt-4 font-mono text-xs text-quiet">Dernière mise à jour : {LAST_UPDATED}</p>
          </header>

          <article className="space-y-10">

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">1. Identité du responsable</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                {brand.legal.companyName}, ci-après « {brand.name} », exploite la plateforme accessible à l&apos;adresse{' '}
                <a href={brand.url} className="text-accent hover:underline">{brand.domain}</a>.
                Pour toute question relative au traitement de vos données :{' '}
                <a href={`mailto:${brand.supportEmail}`} className="text-accent hover:underline">{brand.supportEmail}</a>.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">2. Données collectées</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                {brand.name} collecte les catégories suivantes :
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink/80 marker:text-accent">
                <li><strong className="text-ink">Données de compte</strong> : nom, prénom, adresse e-mail, mot de passe haché (géré par Clerk).</li>
                <li><strong className="text-ink">Données de facturation</strong> : informations Stripe (jamais stockées en clair côté {brand.name}).</li>
                <li><strong className="text-ink">Données d&apos;usage</strong> : logs techniques ; dans votre navigateur, mesure d&apos;audience (PostHog) uniquement si vous l&apos;avez acceptée ; côté serveur, quelques événements clés de votre compte (inscription, création de campagne, abonnement), rattachés à votre identifiant de compte, pour suivre le bon fonctionnement du service (intérêt légitime, vous pouvez vous y opposer en écrivant à l&apos;adresse ci-dessus).</li>
                <li><strong className="text-ink">Données de prospection</strong> : leads importés, saisis ou enrichis via nos fournisseurs de données B2B, sous votre responsabilité de traitement.</li>
                <li><strong className="text-ink">Données de messagerie</strong> : si vous connectez une boîte e-mail ou un compte LinkedIn, les réponses de vos prospects aux messages envoyés par vos campagnes (expéditeur, objet, texte), afin d&apos;arrêter les relances et de vous les présenter.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">3. Finalités du traitement</h2>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink/80 marker:text-accent">
                <li>Fournir et améliorer le service (base légale : exécution contractuelle).</li>
                <li>Facturation et gestion de l&apos;abonnement (obligation légale).</li>
                <li>Sécurité, prévention de la fraude (intérêt légitime).</li>
                <li>Communications produit (consentement explicite, désinscription à tout moment).</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">4. Sous-traitants</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                {brand.name} s&apos;appuie sur les prestataires suivants. Lorsqu&apos;un prestataire traite des données
                hors de l&apos;Union européenne, le transfert est encadré par les clauses contractuelles types
                de la Commission européenne ou par le Data Privacy Framework.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink/80 marker:text-accent">
                <li><strong className="text-ink">Vercel</strong> : hébergement applicatif (exécution en Europe, région Paris).</li>
                <li><strong className="text-ink">Railway</strong> : hébergement de la base de données.</li>
                <li><strong className="text-ink">Clerk</strong> : authentification (États-Unis).</li>
                <li><strong className="text-ink">Stripe</strong> : paiements (États-Unis, PCI-DSS).</li>
                <li><strong className="text-ink">Anthropic</strong> : modèles d&apos;IA Claude pour la rédaction, le scoring des leads et la classification des réponses (États-Unis). Les données envoyées ne servent pas à entraîner les modèles.</li>
                <li><strong className="text-ink">Ollama</strong> : modèles d&apos;IA de secours, utilisés uniquement si le service Anthropic n&apos;est pas configuré.</li>
                <li><strong className="text-ink">Apollo.io, Hunter.io et fournisseurs d&apos;enrichissement</strong> (Dropcontact, LeadMagic, Findymail, Prospeo) : recherche et vérification de coordonnées professionnelles.</li>
                <li><strong className="text-ink">Unipile</strong> : connexion et messagerie LinkedIn, si vous connectez un compte.</li>
                <li><strong className="text-ink">Google et Microsoft</strong> : envoi et lecture des réponses, si vous connectez une boîte Gmail ou Outlook.</li>
                <li><strong className="text-ink">Resend et Cloudflare</strong> : envoi d&apos;e-mails et réception des réponses adressées à nos adresses techniques.</li>
                <li><strong className="text-ink">Inngest</strong> : exécution des tâches planifiées (séquences, détection des réponses).</li>
                <li><strong className="text-ink">Sentry</strong> : suivi des erreurs techniques.</li>
                <li><strong className="text-ink">PostHog</strong> : mesure d&apos;audience (hébergement Union européenne) : dans le navigateur uniquement après votre consentement, et événements clés du compte côté serveur.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">5. Boîtes e-mail connectées (Gmail, Outlook, SMTP)</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Si vous choisissez de connecter votre compte Gmail, {brand.name} demande deux autorisations (pour Outlook, les équivalents Microsoft Mail.Send et Mail.Read ; pour une boîte SMTP, l&apos;accès IMAP en lecture avec les identifiants que vous fournissez) :
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink/80 marker:text-accent">
                <li><strong className="text-ink">gmail.send</strong> : envoyer, depuis votre adresse et à votre demande, les e-mails de prospection que vous avez rédigés ou approuvés.</li>
                <li><strong className="text-ink">gmail.readonly</strong> : détecter les réponses de vos prospects à ces e-mails, pour arrêter automatiquement les relances et afficher la réponse dans votre boîte de réception {brand.name}.</li>
              </ul>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink/80 marker:text-accent">
                <li>{brand.name} ne conserve que les réponses aux e-mails envoyés par vos campagnes. Les autres messages reçus sont lus de manière automatisée, uniquement pour vérifier s&apos;il s&apos;agit d&apos;une telle réponse : ils ne sont ni conservés, ni classés, ni transmis à un tiers.</li>
                <li>{brand.name} ne modifie, ne déplace et ne supprime aucun message de votre boîte.</li>
                <li>Les jetons d&apos;accès OAuth sont chiffrés au repos (AES-256-GCM) et ne sont jamais partagés avec des tiers.</li>
                <li>Aucune donnée Google n&apos;est utilisée à des fins publicitaires, vendue, ni utilisée pour entraîner des modèles d&apos;IA. Le texte d&apos;une réponse peut être transmis à notre fournisseur d&apos;IA (Anthropic) uniquement pour la classer (intéressé, pas intéressé, demande de rendez-vous…), sans entraînement.</li>
                <li>Vous pouvez révoquer l&apos;accès à tout moment depuis vos paramètres {brand.name} ou depuis{' '}
                  <a href="https://myaccount.google.com/permissions" className="text-accent hover:underline">myaccount.google.com/permissions</a>.</li>
              </ul>
              <p className="mt-3 leading-[1.75] text-ink/80">
                L&apos;utilisation des informations reçues des API Google par {brand.name} est conforme à la{' '}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent hover:underline">
                  Google API Services User Data Policy
                </a>, y compris ses exigences <strong className="text-ink">Limited Use</strong>.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">6. Durée de conservation</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Vos données sont conservées pendant toute la durée de votre abonnement, puis pendant 12 mois après résiliation
                (obligations comptables et défense de droits). Les logs sont conservés 90 jours maximum.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">7. Vos droits</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
                de portabilité, de limitation et d&apos;opposition. Pour exercer ces droits, contactez{' '}
                <a href={`mailto:${brand.supportEmail}`} className="text-accent hover:underline">{brand.supportEmail}</a>.
                Vous pouvez également déposer une réclamation auprès de la CNIL.
              </p>
            </section>

            <section id="cookies">
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">8. Cookies</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                {brand.name} utilise des cookies et un stockage local strictement nécessaires (authentification,
                session, mémorisation de votre choix). La mesure d&apos;audience (PostHog, hébergé dans l&apos;Union
                européenne) n&apos;est chargée qu&apos;après votre accord dans la bannière ; sans accord, aucun traceur
                n&apos;est déposé. Vous pouvez changer d&apos;avis à tout moment via le lien « Gérer les cookies » en bas
                de page. Aucun cookie publicitaire.
              </p>
            </section>

            <section>
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">9. Modifications</h2>
              <p className="mt-3 leading-[1.75] text-ink/80">
                Cette politique peut évoluer. Toute modification substantielle sera notifiée par e-mail
                au moins 30 jours avant son entrée en vigueur.
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
