/**
 * Phantera: White-label brand contract.
 *
 * ONE codebase, N brands. Every user-visible piece of identity (name, tagline,
 * colors, legal entity, CTAs, SEO copy) lives in a BrandConfig: never hardcoded
 * in components. The active brand is resolved from NEXT_PUBLIC_BRAND at build
 * time (see ./index.ts), so each Vercel project ships exactly one brand.
 *
 * Rule (Maxwell): adding a new brand must NEVER require touching a component
 * only adding a `<key>.ts` config file that satisfies this interface.
 */

export type BrandKey = 'phantera' | 'sparx'

/** Visual mode drives the token set applied in P2 (dark neon vs light editorial). */
export type BrandMode = 'dark' | 'light'

export interface BrandColors {
  /** Primary accent: phantera: electric cyan; sparx: teal. */
  primary: string
  /** Darker companion of primary (gradients, hovers). */
  primaryDeep: string
  /** Page background: phantera: near-black void; sparx: ivory. */
  background: string
  /** Elevated surface (cards). */
  surface: string
  /** Main text color on background. */
  text: string
  /** Secondary/muted text. */
  textMuted: string
}

export interface BrandLegal {
  /** Entity operating the brand (shown in legal pages / footer). */
  companyName: string
  legalForm?: string
  siren?: string
  vatNumber?: string
  address?: string
  rcs?: string
  /** Legal representative (mentions légales). */
  representative?: string
}

export interface BrandSeo {
  /** <title> default. */
  title: string
  /** Template for page titles, e.g. '%s | Phantera'. */
  titleTemplate: string
  description: string
  keywords: string[]
  /** OpenGraph site title/description (may differ from <title>). */
  ogTitle: string
  ogDescription: string
  twitterHandle?: string
  /** Twitter card copy: falls back to og values when omitted. */
  twitterTitle?: string
  twitterDescription?: string
}

export interface BrandCta {
  /** Primary action label (e.g. 'Start Free Trial' / 'Démarrer mon diagnostic'). */
  primary: string
  /** Secondary action label (e.g. 'Watch Demo' / 'Découvrir le parcours'). */
  secondary: string
  /** Header sign-in label. */
  signIn: string
  /** Header get-started label. */
  getStarted: string
}

export interface BrandConfig {
  key: BrandKey
  /** Display name: 'Phantera' / 'Spar-x'. */
  name: string
  /** One-line positioning shown near the logo / hero. */
  tagline: string
  /** Longer product description (hero subline, meta fallback). */
  description: string
  /** Naked production domain, e.g. 'phantera-tn.com'. */
  domain: string
  /** Canonical https origin, e.g. 'https://phantera-tn.com'. */
  url: string
  supportEmail: string
  /** UI language of the brand deployment. */
  locale: 'en' | 'fr'
  mode: BrandMode
  colors: BrandColors
  legal: BrandLegal
  seo: BrandSeo
  cta: BrandCta
}
