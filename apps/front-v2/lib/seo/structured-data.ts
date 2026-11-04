/**
 * JSON-LD structured data: brand-aware.
 *
 * Identity fields (name, url, contact) come from the active brand config.
 * softwareApp and organization describe the whole site (root layout). The
 * FAQ schema mirrors the FAQ section of the landing page and is emitted there
 * only: FAQ markup must match content visible on the same page.
 */
import { brand, isPhantera } from '@/lib/brand'
import { faqs } from '@/lib/marketing/faq-content'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

export const softwareAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: brand.name,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  inLanguage: 'fr-FR',
  url: brand.url,
  description: brand.description,
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '0',
    highPrice: String(PLAN_CONFIG.ENTERPRISE.price),
    priceCurrency: 'EUR',
  },
  // aggregateRating intentionally omitted until we have real, verifiable reviews.
  // Fabricated ratings risk Google structured-data penalties and mislead answer
  // engines: both worse than having no rating.
  // Only what the product does today: no compliance badge or intent detection
  // claim until it is proven (War Room study, domains/07 §5).
  featureList: [
    'Recherche de décideurs B2B et vérification des e-mails',
    'Score de pertinence des leads de 0 à 100 par IA',
    'Rédaction des séquences par IA, relues avant envoi',
    'Envoi depuis vos boîtes Gmail, Outlook ou SMTP et votre compte LinkedIn',
    'Arrêt automatique de la séquence dès que le prospect répond',
    'Classement des réponses par IA',
    'Export CSV des leads chauds',
  ],
}

export const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  inLanguage: 'fr-FR',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
}

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: brand.name,
  url: brand.url,
  logo: `${brand.url}/brand/phantera-logo-400.png`,
  // sameAs removed: the listed social profiles could not be confirmed (the
  // footer LinkedIn link is a placeholder). Add them back once they exist.
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: isPhantera ? 'support@phantera-tn.com' : brand.supportEmail,
  },
}
