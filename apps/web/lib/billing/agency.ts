/**
 * Phantera: Agency / white-label tier (consolidation: highest-NRR segment).
 *
 * Agencies self-acquire clients, want rebranding + consolidated billing, and pay
 * a wholesale per-active-contact rate with volume discounts. The veille flags
 * this as the best NRR / lowest-CAC go-to-market. Pure config + pricing rollup.
 */

export interface WhiteLabelConfig {
  brandName: string
  /** Custom domain the agency serves the app under. */
  domain: string
  logoUrl?: string
  supportEmail: string
  /** Hide "Powered by Phantera". */
  removeBranding: boolean
}

export interface SubAccount {
  id: string
  name: string
  activeContacts: number
}

/**
 * Wholesale per-active-contact rate (EUR/month) by total volume across all
 * sub-accounts. Volume discounts reward the agency for scaling.
 */
export function agencyWholesaleRate(totalContacts: number): number {
  if (totalContacts >= 50_000) return 0.05
  if (totalContacts >= 20_000) return 0.06
  if (totalContacts >= 5_000) return 0.08
  return 0.1
}

export interface AgencyRollup {
  subAccounts: number
  totalContacts: number
  ratePerContact: number
  /** Consolidated monthly bill (EUR). */
  total: number
}

/** Roll up all sub-accounts into one consolidated, volume-priced bill. */
export function rollupAgency(subs: SubAccount[]): AgencyRollup {
  const totalContacts = subs.reduce((sum, s) => sum + Math.max(0, s.activeContacts), 0)
  const rate = agencyWholesaleRate(totalContacts)
  return {
    subAccounts: subs.length,
    totalContacts,
    ratePerContact: rate,
    total: Math.round(totalContacts * rate * 100) / 100,
  }
}
