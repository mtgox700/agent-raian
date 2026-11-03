/** Status filters of the Leads page and the stored statuses each one covers. */
export const LEAD_STATUS_FILTERS: Record<string, string[]> = {
  new:       ['new', 'queued'],
  contacted: ['contacted'],
  qualified: ['qualified'],
  converted: ['converted'],
  lost:      ['lost'],
}

/** Search words: "Camille Martin" must find the lead whose first and last names match. */
export function searchWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)
}

/** Client-side match, same rule as the server: every word in some field. */
export function leadMatchesSearch(
  lead: { firstName: string; lastName: string; email: string; company: string | null; title: string | null },
  query: string,
): boolean {
  const haystack = [lead.firstName, lead.lastName, lead.email, lead.company ?? '', lead.title ?? ''].join(' ').toLowerCase()
  return searchWords(query).every((word) => haystack.includes(word))
}
