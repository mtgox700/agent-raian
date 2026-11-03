/**
 * Rich Apollo enrichment extras are stored as JSON in
 * `LeadEnrichment.linkedinData` (no dedicated columns -> no migration). This
 * helper parses that JSON defensively into the typed shape consumed by the lead
 * detail drawer. Shared by the leads list page and the campaign detail page.
 */

export interface EnrichmentExtras {
  headline?:           string | null
  city?:               string | null
  companyDescription?: string | null
  companyLinkedinUrl?: string | null
  technologies?:       string[]
}

export function parseEnrichmentExtras(data: unknown): EnrichmentExtras {
  if (!data || typeof data !== 'object') return {}
  const d = data as Record<string, unknown>
  return {
    headline:           typeof d.headline === 'string' ? d.headline : null,
    city:               typeof d.city === 'string' ? d.city : null,
    companyDescription: typeof d.companyDescription === 'string' ? d.companyDescription : null,
    companyLinkedinUrl: typeof d.companyLinkedinUrl === 'string' ? d.companyLinkedinUrl : null,
    technologies:       Array.isArray(d.technologies) ? d.technologies.filter((t): t is string => typeof t === 'string') : [],
  }
}
