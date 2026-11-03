import type { Metadata } from 'next'
import Link from 'next/link'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { StructuredData } from '@/components/seo/StructuredData'
import { brand } from '@/lib/brand'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { PageHeader } from '@/components/marketing/PageHeader'
import { buttonVariants } from '@/components/ui/button-variants'

const business = PLAN_CONFIG.BUSINESS
const PAGE_URL = `${brand.url}/pilote`
const BOOKING_HREF = `mailto:contact@${brand.domain}?subject=${encodeURIComponent('Pilote 30 jours Phantera')}`

export const metadata: Metadata = {
  title: 'Pilote de 30 jours, mis en place avec vous',
  description: `Pour les fondateurs de cabinets, d'ESN et d'agences B2B : votre client idéal, votre domaine vérifié et une première campagne relue avec vous, sur la formule ${business.name} à ${business.price} € HT par mois, sans engagement.`,
  alternates: { canonical: PAGE_URL },
}

const STEPS = [
  { title: 'Votre client idéal', text: 'Fonctions, secteurs, taille, zone et exclusions : on les écrit ensemble, en une demi-heure.' },
  { title: 'Votre domaine vérifié', text: 'Avant le premier e-mail, on contrôle SPF, DKIM et DMARC, et on règle le plafond quotidien de votre boîte.' },
  { title: 'Votre première campagne', text: 'Phantera trouve les décideurs et rédige la séquence. Vous relisez et corrigez chaque message avant l\'envoi.' },
  { title: 'Les résultats, ensemble', text: 'Envois, rebonds, désinscriptions, réponses : on lit vos vrais chiffres et on ajuste le message, pas le volume.' },
]

const PROMISES = [
  'Votre domaine est vérifié avant le premier envoi.',
  'Votre boîte n\'envoie jamais plus que le plafond que vous avez choisi.',
  'Chaque séquence s\'arrête dès que Phantera détecte la réponse du prospect ou sa désinscription.',
  'Vous voyez les vrais chiffres de votre campagne, sans retouche.',
]

const NON_PROMISES = [
  'Un nombre de rendez-vous garanti.',
  'Un taux d\'ouverture ou de réponse.',
  'Des envois WhatsApp automatiques : WhatsApp interdit d\'écrire à quelqu\'un sans son accord préalable.',
]

const FAQS = [
  {
    question: 'Combien coûte le pilote ?',
    answer: `C'est la formule ${business.name}, à ${business.price} € HT par mois. La mise en place avec nous est comprise. Vous résiliez quand vous voulez depuis vos réglages, sans engagement.`,
  },
  {
    question: 'Pour qui est-ce fait ?',
    answer: 'Pour les fondateurs et associés de cabinets de conseil, d\'ESN et d\'agences B2B de 2 à 20 personnes, qui prospectent eux-mêmes entre deux missions.',
  },
  {
    question: 'Mes e-mails partent-ils de ma boîte ?',
    answer: 'Oui : depuis votre Gmail, votre Outlook ou votre serveur SMTP, à votre nom. Les réponses arrivent chez vous.',
  },
]

function faqSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  }
}

function List({ items, tone }: { items: string[]; tone: 'yes' | 'no' }) {
  return (
    <ul className="mt-6 border-t border-border">
      {items.map((item) => (
        <li key={item} className="flex gap-4 border-b border-border py-4 leading-relaxed text-white/80">
          <span
            aria-hidden="true"
            className={tone === 'yes' ? 'mt-[0.7em] h-px w-3 shrink-0 bg-cyan' : 'mt-[0.7em] h-px w-3 shrink-0 bg-muted'}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function PilotPage() {
  return (
    <>
      <StructuredData schema={faqSchema()} />
      <Navbar />
      <main id="main-content">
        <PageHeader
          eyebrow="Pilote 30 jours"
          title="Un pilote de 30 jours, mis en place avec vous."
          lead="Pour les fondateurs de cabinets, d’ESN et d’agences B2B qui vendent eux-mêmes. Vous gardez la main sur chaque message. Nous nous occupons du reste avec vous."
          photo="pilot"
        >
          <a href={BOOKING_HREF} className={buttonVariants({ size: 'lg' })}>
            Demander un appel de 20 minutes
          </a>
          <Link href="/sign-up" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Essayer seul, gratuitement
          </Link>
        </PageHeader>

        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <section className="border-b border-border py-20" aria-labelledby="steps-title">
            <h2 id="steps-title" className="font-mono text-sm text-muted">Ce qu&apos;on fait ensemble</h2>
            <ol className="mt-8 grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className={'border-b border-border py-8 sm:pr-6 ' + (index > 0 ? 'lg:border-l lg:pl-6 ' : '') + (index % 2 === 1 ? 'sm:border-l sm:pl-6' : '')}
                >
                  <p className="font-mono text-xs text-cyan tabular-nums">{`0${index + 1}`}</p>
                  <h3 className="mt-3 font-display text-xl font-semibold tracking-[-0.02em] text-white">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-12 border-b border-border py-20 md:grid-cols-2 md:gap-10">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-white">Ce que nous tenons</h2>
              <List items={PROMISES} tone="yes" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-white">Ce que nous ne promettons pas</h2>
              <List items={NON_PROMISES} tone="no" />
            </div>
          </section>

          <section className="border-b border-border py-20">
            <div className="relative rounded-[10px] border border-border bg-obsidian p-8 md:p-10">
              <span className="absolute inset-x-0 top-[-1px] h-px bg-gold" aria-hidden="true" />
              <h2 className="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold tracking-[-0.03em] text-white">{`${business.price} € HT par mois, sans engagement`}</h2>
              <p className="mt-4 max-w-[44rem] leading-relaxed text-muted">
                {`Le pilote, c'est la formule ${business.name} (${business.leadsLimit.toLocaleString('fr-FR')} leads par mois, séquences e-mail et LinkedIn, boîte de réponses classées par l'IA), avec la mise en place faite avec vous. Vous résiliez quand vous voulez depuis vos réglages.`}
              </p>
              <a href={BOOKING_HREF} className={buttonVariants({ size: 'lg', className: 'mt-8' })}>
                Demander un appel de 20 minutes
              </a>
            </div>
          </section>

          <section className="py-20" aria-labelledby="pilot-faq-title">
            <h2 id="pilot-faq-title" className="font-display text-2xl font-semibold tracking-[-0.02em] text-white">Questions fréquentes</h2>
            <dl className="mt-6 border-t border-border">
              {FAQS.map((faq) => (
                <div key={faq.question} className="grid gap-2 border-b border-border py-6 md:grid-cols-12 md:gap-10">
                  <dt className="font-medium text-white md:col-span-4">{faq.question}</dt>
                  <dd className="leading-relaxed text-muted md:col-span-8">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
