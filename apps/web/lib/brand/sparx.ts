/**
 * Brand config: SPAR-X (white-label deployment).
 *
 * Sourced from the real brand material (founder-provided logo SVGs + spar-x.fr,
 * archived in .war-room/TEAM_MEMORY.md § CHARTE SPAR-X: extracted 2026-07-04):
 *   • teal #006D71 (exact fill of logo-sparx.svg), off-white #FBFFFE
 *   • ivory page background, charcoal text, editorial serif display
 *   • French, premium consulting tone (« agentique », « orchestrateur »)
 *   • Legal entity: e-kigai SCOP SAS (marque Spar-x), Anglet: RCS Bayonne
 *
 * ⚠️ domain: the Spar-x APP domain is a founder decision (spar-x.fr hosts the
 * consulting site). Placeholder `app.spar-x.fr` until confirmed: update here
 * only, nothing else to touch.
 */

import type { BrandConfig } from './types'

export const sparxBrand: BrandConfig = {
  key: 'sparx',
  name: 'Spar-x',
  tagline: 'Le premier cabinet de conseil agentique',
  description:
    "Spar-x conçoit, déploie et pilote des organisations où humains et agents IA collaborent. Prospection B2B agentique : vos agents trouvent, qualifient et contactent vos clients idéaux, sous supervision humaine.",
  domain: 'app.spar-x.fr',
  url: 'https://app.spar-x.fr',
  supportEmail: 'data@spar-x.fr',
  locale: 'fr',
  mode: 'light',

  colors: {
    primary: '#006D71',
    primaryDeep: '#004F53',
    background: '#F5F3EE',
    surface: '#FBFFFE',
    text: '#1A1A1A',
    textMuted: '#5C5C57',
  },

  legal: {
    companyName: 'e-kigai',
    legalForm: 'SCOP SAS à capital variable',
    siren: '999 138 050',
    vatNumber: 'FR90999138050',
    address: '1 Allée des Écuries, 64600 Anglet, France',
    rcs: 'Bayonne',
    representative: 'M. Mehdi Terbeche',
  },

  seo: {
    title: 'Spar-x : Prospection B2B agentique',
    titleTemplate: '%s | Spar-x',
    description:
      "Plateforme de prospection agentique par Spar-x : des agents IA qui trouvent, enrichissent, qualifient et contactent vos clients B2B idéaux, sous supervision humaine.",
    keywords: [
      'IA agentique',
      'prospection B2B',
      'agents IA',
      'cabinet de conseil agentique',
      'collaboration humain-agent',
      'lead generation IA',
      'orchestrateur agents',
      'prospection automatisée',
    ],
    ogTitle: 'Spar-x : Vos équipes ne travailleront plus jamais seules.',
    ogDescription:
      'Des agents IA qui prospectent, qualifient et contactent vos clients idéaux, sous supervision humaine.',
  },

  cta: {
    primary: 'Démarrer mon diagnostic',
    secondary: 'Découvrir le parcours',
    signIn: 'Se connecter',
    getStarted: 'Commencer',
  },
}
