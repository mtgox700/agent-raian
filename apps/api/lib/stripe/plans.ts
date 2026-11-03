/**
 * Phantera: Plan configuration (single source of truth)
 *
 * All plan limits, features, and Stripe price IDs live here.
 * Never scatter magic numbers across the codebase.
 *
 * Three pricing tiers, each with monthly + annual cycle:
 *   • PRO         €49/mo  · €470/yr   (-20%)
 *   • BUSINESS    €149/mo · €1430/yr  (-20%)
 *   • ENTERPRISE  €500/mo · €4800/yr  (-20%)
 *
 * Each plan exposes BOTH price IDs so the checkout API can pick based on
 * the user's billing-cycle choice.
 */

import type { Plan } from '@prisma/client'

export type BillingCycle = 'monthly' | 'annual'

export interface PlanConfig {
  key:                  Plan
  name:                 string
  price:                number              // EUR per month (monthly cycle)
  annualPrice:          number              // EUR per year (annual cycle, post -20%)
  stripePriceId:        string | null       // monthly price (null = free)
  stripeAnnualPriceId:  string | null       // annual price (null = no annual option)
  leadsLimit:           number              // Infinity = unlimited
  campaignsLimit:       number              // Infinity = unlimited
  emailStepsLimit:      number
  emailSendsLimit:      number              // emails sent per month
  /** Connected sending mailboxes (Gmail, Outlook, SMTP); aliases do not count. */
  mailboxLimit:         number              // Infinity = unlimited
  /** People in the workspace, pending invitations included. */
  seatLimit:            number              // Infinity = unlimited
  hasAiGeneration:      boolean
  hasPrioritySupport:   boolean
  features:             string[]
}

export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  FREE: {
    key:                 'FREE',
    name:                'Gratuit',
    price:               0,
    annualPrice:         0,
    stripePriceId:       null,
    stripeAnnualPriceId: null,
    leadsLimit:          100,
    campaignsLimit:      1,
    emailStepsLimit:     3,
    emailSendsLimit:     100,
    mailboxLimit:        1,
    seatLimit:           1,
    hasAiGeneration:     false,
    hasPrioritySupport:  false,
    features: [
      '100 leads / mois',
      '1 campagne active',
      '3 e-mails par séquence',
      '1 boîte d\'envoi',
      'Analytics basiques',
    ],
  },

  STARTER: {
    key:                 'STARTER',
    name:                'Starter',
    price:               49,
    annualPrice:         470,
    stripePriceId:       null,   // Legacy — not sold
    stripeAnnualPriceId: null,
    leadsLimit:          500,
    campaignsLimit:      5,
    emailStepsLimit:     4,
    emailSendsLimit:     500,
    mailboxLimit:        1,
    seatLimit:           1,
    hasAiGeneration:     false,
    hasPrioritySupport:  false,
    features: [
      '500 leads / mois',
      '5 campagnes actives',
      '4 e-mails par séquence',
    ],
  },

  PRO: {
    key:                 'PRO',
    name:                'Pro',
    price:               49,
    annualPrice:         470,
    stripePriceId:       process.env.STRIPE_PRO_PRICE_ID        ?? null,
    stripeAnnualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? null,
    leadsLimit:          1000,
    campaignsLimit:      Infinity,
    emailStepsLimit:     5,
    emailSendsLimit:     5000,
    mailboxLimit:        1,
    seatLimit:           1,
    hasAiGeneration:     true,
    hasPrioritySupport:  false,
    features: [
      '1 000 leads / mois',
      'Campagnes illimitées',
      '5 e-mails par séquence',
      '1 boîte d\'envoi',
      'Génération IA + auto-critique',
      'Analytics avancées',
      'Export CSV',
    ],
  },

  BUSINESS: {
    key:                 'BUSINESS',
    name:                'Business',
    price:               149,
    annualPrice:         1430,
    stripePriceId:       process.env.STRIPE_BUSINESS_PRICE_ID        ?? null,
    stripeAnnualPriceId: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID ?? null,
    leadsLimit:          5000,
    // Friend-testing cap removed 2026-07-06 (founder): back to the advertised
    // unlimited campaigns, consistent with the public pricing page.
    campaignsLimit:      Infinity,
    emailStepsLimit:     7,
    emailSendsLimit:     15000,
    mailboxLimit:        3,
    seatLimit:           3,
    hasAiGeneration:     true,
    // Promised in the features below ("Support prioritaire par e-mail"):
    // a human commitment of the founder, kept on 2026-10-26.
    hasPrioritySupport:  true,
    features: [
      '5 000 leads / mois',
      'Campagnes illimitées',
      '7 e-mails par séquence',
      '3 boîtes d\'envoi, une boîte ou un alias par campagne',
      'Génération IA + auto-critique',
      'Campagne express : votre site devient une campagne',
      'Conseiller ICP : l\'IA recommande qui cibler',
      'Boîte de réponses + classification IA',
      'Séquences e-mail et LinkedIn',
      'Export des leads chauds pour votre CRM (CSV)',
      'Support prioritaire par e-mail',
    ],
  },

  ENTERPRISE: {
    key:                 'ENTERPRISE',
    name:                'Entreprise',
    price:               500,
    annualPrice:         4800,
    stripePriceId:       process.env.STRIPE_ENTERPRISE_PRICE_ID        ?? null,
    stripeAnnualPriceId: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID ?? null,
    leadsLimit:          Infinity,
    campaignsLimit:      Infinity,
    emailStepsLimit:     10,
    emailSendsLimit:     Infinity,
    mailboxLimit:        Infinity,
    seatLimit:           Infinity,
    hasAiGeneration:     true,
    hasPrioritySupport:  true,
    features: [
      'Leads illimités',
      'Campagnes illimitées',
      '10 e-mails par séquence',
      'Boîtes d\'envoi illimitées, une boîte ou un alias par campagne',
      'Génération IA + auto-critique',
      'Campagne express + Conseiller ICP IA',
      'Séquences e-mail et LinkedIn',
      'Export des leads chauds pour votre CRM (CSV)',
      'Onboarding accompagné',
      'Support prioritaire',
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPlanConfig(plan: Plan): PlanConfig {
  return PLAN_CONFIG[plan]
}

/**
 * Resolve the Plan tier from a Stripe price ID: checks BOTH monthly and
 * annual price IDs across every configured plan. Returns null when the price
 * is not part of our current pricing table (e.g. legacy / archived price).
 */
export function getPlanByPriceId(priceId: string): Plan | null {
  for (const [plan, config] of Object.entries(PLAN_CONFIG)) {
    if (config.stripePriceId === priceId || config.stripeAnnualPriceId === priceId) {
      return plan as Plan
    }
  }
  return null
}

/**
 * Pick the right Stripe price ID given a plan + billing cycle.
 * Falls back to monthly if annual is not configured.
 */
export function resolvePriceId(plan: Plan, cycle: BillingCycle): string | null {
  const config = PLAN_CONFIG[plan]
  if (cycle === 'annual' && config.stripeAnnualPriceId) {
    return config.stripeAnnualPriceId
  }
  return config.stripePriceId
}

/**
 * Detect whether a Stripe price ID is the annual variant of a plan.
 * Used by the webhook handler to record billing cycle on the workspace.
 */
export function isAnnualPriceId(priceId: string): boolean {
  for (const config of Object.values(PLAN_CONFIG)) {
    if (config.stripeAnnualPriceId === priceId) return true
  }
  return false
}

export function getPlanLimits(plan: Plan) {
  const config = PLAN_CONFIG[plan]
  return {
    leadsLimit:      config.leadsLimit,
    campaignsLimit:  config.campaignsLimit,
    emailStepsLimit: config.emailStepsLimit,
    emailSendsLimit: config.emailSendsLimit,
    mailboxLimit:    config.mailboxLimit,
    seatLimit:       config.seatLimit,
    hasAiGeneration: config.hasAiGeneration,
  }
}

/** Plans that have a real Stripe price (i.e. are purchasable) */
export const PURCHASABLE_PLANS: Plan[] = ['PRO', 'BUSINESS', 'ENTERPRISE']
