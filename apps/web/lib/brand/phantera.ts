/**
 * Brand config: PHANTERA (default brand).
 *
 * Every value below is EXTRACTED from the previously hardcoded strings
 * (app/layout.tsx metadata, Navbar, Hero, legal pages): not invented.
 * P1 acceptance criterion: with NEXT_PUBLIC_BRAND=phantera the rendered site
 * must be pixel-identical to the pre-refactor version.
 */

import type { BrandConfig } from './types'

export const phanteraBrand: BrandConfig = {
  key: 'phantera',
  name: 'Phantera',
  // Signature slogan chosen 2026-10-11 with the « Arrêt net » logo.
  tagline: 'Prospectez comme vous aimeriez être prospecté.',
  description:
    'Phantera trouve, enrichit, score et contacte vos clients B2B idéaux grâce à des agents IA autonomes. E-mails vérifiés, messages personnalisés, séquences multicanales e-mail, LinkedIn, SMS et WhatsApp.',
  domain: 'phantera-tn.com',
  // www: the apex answers with a 307 redirect, so canonical URLs, sitemap
  // and robots must point to www directly (crawlers do not all follow it).
  url: 'https://www.phantera-tn.com',
  supportEmail: 'privacy@phantera-tn.com',
  locale: 'fr',
  mode: 'dark',

  colors: {
    primary: '#00D4FF',
    primaryDeep: '#0099CC',
    background: '#050508',
    surface: '#0A0A14',
    text: '#FFFFFF',
    textMuted: '#8888A0',
  },

  legal: {
    companyName: 'Phantera SAS',
    legalForm: 'SAS',
  },

  seo: {
    title: 'Phantera | Prospection B2B autonome par IA',
    titleTemplate: '%s | Phantera',
    description:
      'Phantera trouve, enrichit, score et contacte vos clients B2B idéaux grâce à des agents IA autonomes. E-mails vérifiés, messages personnalisés, séquences e-mail, LinkedIn, SMS et WhatsApp.',
    // Audit Elias 2026-07-14 (.war-room/SEO_KEYWORDS_AUDIT.md) : requêtes que
    // l'acheteur FR tape réellement : têtes transactionnelles + requêtes de
    // switch. "agent commercial autonome" retiré (statut juridique FR, mauvaise
    // intention de recherche).
    keywords: [
      'logiciel de prospection B2B',
      'outil de prospection LinkedIn',
      'prospection B2B IA',
      'cold email automatisé',
      'automatisation prospection commerciale',
      'scoring de leads IA',
      'SDR IA',
      'alternative Apollo',
      'alternative Lemlist',
    ],
    ogTitle: 'Phantera | Prospectez comme vous aimeriez être prospecté',
    ogDescription:
      'Des agents IA qui prospectent, enrichissent, scorent et contactent vos clients idéaux 24h/24.',
    twitterHandle: '@phantera_ai',
    twitterTitle: 'Phantera | Prospection B2B autonome par IA',
    twitterDescription:
      'Des agents IA qui automatisent toute votre prospection B2B.',
  },

  cta: {
    primary: 'Commencer gratuitement',
    secondary: 'Voir la démo',
    signIn: 'Se connecter',
    getStarted: 'Commencer',
  },
}
