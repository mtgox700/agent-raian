/** Shape of every content document. A CMS collection mirrors one schema. */

import { z } from 'zod'

export const Identity = z.object({
  $schema: z.string().optional(),
  /** Display name: 'Phantera' / 'Spar-x'. */
  name: z.string().min(1),
  /** One-line positioning shown near the logo / hero. */
  tagline: z.string(),
  /** Longer product description (hero subline, meta fallback). */
  description: z.string(),
  /** Naked production domain, e.g. 'phantera-tn.com'. */
  domain: z.string(),
  /** Canonical https origin (www when the apex redirects: crawlers do not all follow it). */
  url: z.string().url(),
  supportEmail: z.string().email(),
  legal: z.object({
    companyName: z.string(),
    legalForm: z.string().optional(),
    siren: z.string().optional(),
    vatNumber: z.string().optional(),
    address: z.string().optional(),
    rcs: z.string().optional(),
    representative: z.string().optional(),
  }),
  seo: z.object({
    title: z.string(),
    titleTemplate: z.string().includes('%s'),
    description: z.string(),
    keywords: z.array(z.string()),
    ogTitle: z.string(),
    ogDescription: z.string(),
    twitterHandle: z.string().optional(),
    twitterTitle: z.string().optional(),
    twitterDescription: z.string().optional(),
  }),
  cta: z.object({
    primary: z.string(),
    secondary: z.string(),
    signIn: z.string(),
    getStarted: z.string(),
  }),
})
export type Identity = z.infer<typeof Identity>

/** A link of a menu. `{domain}` in href is replaced by the brand's domain (contact mailto). */
const Link = z.object({ label: z.string().min(1), href: z.string().min(1) })

/** Header and footer of every marketing page. */
export const Navigation = z.object({
  $schema: z.string().optional(),
  /** aria-label of the logo link, e.g. 'Phantera, accueil'. */
  homeAriaLabel: z.string().min(1),
  /** First focusable link of every page, jumps to <main>. */
  skipLink: z.string().min(1),
  navbar: z.object({
    ariaLabel: z.string().min(1),
    menuAriaLabel: z.string().min(1),
    links: z.array(Link).min(1),
    signIn: z.string().min(1),
    getStarted: z.string().min(1),
  }),
  footer: z.object({
    columns: z.array(z.object({
      title: z.string().min(1),
      links: z.array(Link),
      /** Appends the cookie-settings button (its label lives in the legal component). */
      withCookieSettings: z.boolean().optional(),
    })).min(1),
    /** Follows '© <year> <brand name>.' */
    rightsReserved: z.string().min(1),
  }),
})
export type Navigation = z.infer<typeof Navigation>

const TitledText = z.object({ title: z.string().min(1), text: z.string().min(1) })

/** Every text of the home page sections (prices stay in code). */
export const Landing = z.object({
  $schema: z.string().optional(),
  hero: z.object({
    eyebrow: z.string().min(1),
    /** Rendered as: first <br/> highlight (highlight in the accent colour). */
    headline: z.object({ first: z.string().min(1), highlight: z.string().min(1) }),
    lead: z.string().min(1),
    primaryCta: z.string().min(1),
    secondaryCta: z.string().min(1),
    guarantees: z.array(z.string().min(1)),
  }),
  stats: z.object({
    ariaLabel: z.string().min(1),
    facts: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).min(1),
  }),
  howItWorks: z.object({
    /** One line each, separated by a line break. */
    titleLines: z.array(z.string().min(1)).min(1),
    intro: z.string().min(1),
    agents: z.array(z.object({ name: z.string().min(1), text: z.string().min(1) })).min(1),
  }),
  features: z.object({
    title: z.string().min(1),
    items: z.array(TitledText).min(1),
    /** Exactly three dashboard captures, or null to hide them (brand with its own palette). */
    productShots: z.tuple([
      z.object({ src: z.string(), width: z.number().int().positive(), height: z.number().int().positive(), label: z.string().min(1), alt: z.string().min(1) }),
      z.object({ src: z.string(), width: z.number().int().positive(), height: z.number().int().positive(), label: z.string().min(1), alt: z.string().min(1) }),
      z.object({ src: z.string(), width: z.number().int().positive(), height: z.number().int().positive(), label: z.string().min(1), alt: z.string().min(1) }),
    ]).nullable(),
  }),
  /** The brand signature section (quote = identity tagline), or null to hide it. */
  signature: z.object({ ariaLabel: z.string().min(1), caption: z.string().min(1) }).nullable(),
  pricing: z.object({
    title: z.string().min(1),
    subtitle: z.string().min(1),
    cycleLegend: z.string().min(1),
    monthly: z.string().min(1),
    annual: z.string().min(1),
    annualBadge: z.string().min(1),
    recommended: z.string().min(1),
    freeForever: z.string().min(1),
    perMonthBilledAnnually: z.string().min(1),
    /** Follows the amount saved, e.g. '98 € économisés par an'. */
    savedPerYear: z.string().min(1),
    perMonthNoCommitment: z.string().min(1),
    /** Followed by the plan name (aria-label of the feature list). */
    includedIn: z.string().min(1),
    footnote: z.string().min(1),
    /** Texts per plan id; prices, links and the recommended plan stay in code. */
    plans: z.record(
      z.enum(['free', 'pro', 'business', 'enterprise']),
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        features: z.array(z.string().min(1)).min(1),
        cta: z.string().min(1),
      }),
    ),
  }),
  contact: z.object({
    title: z.string().min(1),
    lead: z.string().min(1),
    primaryCta: z.string().min(1),
    secondaryCta: z.string().min(1),
    perks: z.array(z.string().min(1)),
  }),
  showLatestArticles: z.boolean(),
})
export type Landing = z.infer<typeof Landing>

/** The home page FAQ, also published as FAQPage structured data and in llms.txt. */
export const Faq = z.object({
  $schema: z.string().optional(),
  title: z.string().min(1),
  /** Rendered as: before + ' ' + <a>linkLabel</a> + after. */
  intro: z.object({ before: z.string().min(1), linkLabel: z.string().min(1), after: z.string() }),
  questions: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).min(1),
})
export type Faq = z.infer<typeof Faq>

/** The panel beside the sign-in and sign-up forms (the forms themselves are Clerk's, localised by Clerk). */
export const Auth = z.object({
  $schema: z.string().optional(),
  /** One line under the headline: what the visitor is signing in to. */
  lead: z.string().min(1),
  /** Product facts only (Reality Lock: no figure, no customer). */
  facts: z.array(z.string().min(1)).min(1),
})
export type Auth = z.infer<typeof Auth>

/** Every document type, by name. Add one here, then a JSON file per brand/locale. */
export const documents = {
  identity: Identity,
  navigation: Navigation,
  landing: Landing,
  faq: Faq,
  auth: Auth,
} as const
export type DocumentName = keyof typeof documents
export type Document<N extends DocumentName> = z.infer<(typeof documents)[N]>
