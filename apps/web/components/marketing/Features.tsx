// Server Component. What the product does, said plainly, beside one real
// alert of the product (scene 3). Reality Lock (C1): only what ships.
import { isSparx } from '@/lib/brand'
import { AnalystAlert } from './scenes/AnalystAlert'
import { ProductShots, type ProductShot } from './ProductShots'

// Real captures of the dashboard, taken in the test environment on the
// fictional demo workspace (labelled as such under the stack). Spar-x has its
// own palette: these Phantera screens are not shown there.
const SHOTS: readonly [ProductShot, ProductShot, ProductShot] = [
  {
    src: '/product/accueil.webp', width: 2880, height: 1800, label: 'Accueil, à traiter',
    alt: 'L’accueil du tableau de bord : trois alertes de l’Analyste, chacune avec ses chiffres, son intervalle de confiance et une action à confirmer.',
  },
  {
    src: '/product/campagnes.webp', width: 2880, height: 1800, label: 'Campagnes',
    alt: 'La page Campagnes : ouvertures, taux de réponse et messages envoyés avec leur base, puis une carte par campagne avec son statut.',
  },
  {
    src: '/product/reponses.webp', width: 2880, height: 1800, label: 'Réponses',
    alt: 'La boîte de réponses : chaque réponse classée (positive, négative, neutre), et une réponse ouverte avec le prospect, son entreprise et la campagne.',
  },
]

const features = [
  {
    title: 'Du ciblage au premier message en quelques minutes',
    text: 'Décrivez votre client idéal et lancez la campagne : les agents trouvent, vérifient et contactent vos prospects.',
  },
  {
    title: 'Ciblage précis',
    text: 'Secteur, fonction, taille et zone. Chaque lead reçoit une note de 0 à 100 selon sa proximité avec votre cible.',
  },
  {
    title: 'Emails vérifiés',
    text: 'L’email professionnel est trouvé puis vérifié avant tout envoi, avec le poste, l’entreprise et le profil LinkedIn.',
  },
  {
    title: 'Email et LinkedIn',
    text: 'Vos séquences alternent emails et messages LinkedIn depuis vos comptes, avec des plafonds quotidiens qui les protègent.',
  },
  {
    title: 'Alertes de campagne',
    text: 'Une campagne qui cale, un segment qui ne répond pas, une boîte en pause : l’alerte le dit avec ses preuves et propose une action, que vous confirmez.',
  },
  {
    title: 'Conçu pour le RGPD',
    // Not "hébergé en Europe": Clerk, Stripe and Anthropic are in the US.
    text: 'Accès aux boîtes chiffrés au repos, désinscription dans chaque email, prestataires listés dans la politique de confidentialité. Vos données n’entraînent jamais nos modèles.',
  },
]

export function Features() {
  return (
    <section id="features" className="border-b border-border py-24 md:py-32" aria-labelledby="features-title">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <h2 id="features-title" className="max-w-[44rem] font-display text-[clamp(2rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
          Ce que l&apos;outil fait vraiment, et ce qu&apos;il vous laisse décider.
        </h2>

        <div className="mt-14 grid gap-14 lg:grid-cols-12 lg:gap-10">
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:col-span-7">
            {features.map((feature) => (
              <li key={feature.title} className="border-t border-border py-6">
                <h3 className="font-medium text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.text}</p>
              </li>
            ))}
          </ul>
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <AnalystAlert />
            </div>
          </div>
        </div>

        {!isSparx && <ProductShots shots={SHOTS} className="mt-20 md:mt-28" />}
      </div>
    </section>
  )
}
