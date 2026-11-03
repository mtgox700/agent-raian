/**
 * Domain extraction for the enrichment waterfall.
 *
 * Email-finder providers (LeadMagic, Findymail, Prospeo) match far better from a
 * company DOMAIN than from a company NAME. Apollo's free people-search already
 * returns the org's primary domain, so we normalise whatever we have (a URL, a
 * bare domain, or null) into a clean `acme.com` form to feed the providers.
 *
 * We deliberately do NOT guess a domain from the company name: a wrong guess can
 * produce a plausible-but-wrong email on accept-all domains, which bounces and
 * hurts deliverability. No domain -> providers fall back to company-name matching
 * (Hunter) or skip; better an empty result than a wrong one.
 */

export function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')   // strip protocol
    .replace(/^www\./, '')          // strip www.
    .split('/')[0]                  // drop any path
    ?.split('?')[0]                 // drop any query
    ?.trim()

  if (!cleaned) return null
  // Must look like a real domain (has a dot, valid chars, no spaces).
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned)) return null
  return cleaned
}
