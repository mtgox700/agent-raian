/**
 * site-reader: fetches a public website and reduces it to clean text for the
 * express-campaign analyzer. Server-side only.
 *
 * Safety: http(s) only, public hostnames only (SSRF guard), 8s timeout,
 * capped output. We read the HOMEPAGE only: enough signal for GTM analysis.
 */

import { safeGet, type SafeResponse } from '@/lib/security/safe-http'

const MAX_TEXT_CHARS = 12_000
const FETCH_TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 3

/** Hostnames/patterns that must never be fetched from our server. */
function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  // Raw IPv4 private ranges + loopback + link-local + metadata endpoints.
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (h === '169.254.169.254' || h === 'metadata.google.internal') return true
  if (h === '::1' || h.startsWith('[')) return true
  return false
}

export function normalizeSiteUrl(input: string): URL | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (isForbiddenHost(url.hostname)) return null
    if (!url.hostname.includes('.')) return null
    return url
  } catch {
    return null
  }
}

/**
 * Fetches a public page, following redirects by hand so every hop is checked
 * (lib/security/safe-http: public address checked at connection time, ports
 * 80/443 only). A public page redirecting to an internal address (cloud
 * metadata, a private service) is refused.
 */
async function fetchPublic(start: URL, signal: AbortSignal): Promise<SafeResponse> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: SafeResponse
    try {
      res = await safeGet(url, {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PhanteraBot/1.0; +https://phantera-tn.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      throw new Error('Cette adresse ne mène pas à un site public')
    }
    if (res.status < 300 || res.status >= 400) return res
    const next = normalizeSiteUrl(new URL(res.headers.get('location') ?? '', url).toString())
    if (!next) throw new Error('Cette adresse redirige vers un emplacement non autorisé')
    url = next
  }
  throw new Error('Trop de redirections : indiquez directement l’adresse finale de votre site')
}

/** Strips a full HTML document down to readable text + title/meta. */
function htmlToText(html: string): { title: string; description: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  const description =
    /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]?.trim()
    ?? /<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1]?.trim()
    ?? ''

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()

  return { title, description, text: text.slice(0, MAX_TEXT_CHARS) }
}

export interface SiteContent {
  url: string
  title: string
  description: string
  text: string
}

export async function readSite(input: string): Promise<SiteContent> {
  const url = normalizeSiteUrl(input)
  if (!url) throw new Error('URL invalide : vérifiez l\'adresse de votre site')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchPublic(url, controller.signal)
    if (res.status < 200 || res.status >= 300) throw new Error(`Le site a répondu ${res.status} : vérifiez qu'il est accessible publiquement`)

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
      throw new Error('Cette adresse ne renvoie pas une page web lisible')
    }

    const html = res.text
    const { title, description, text } = htmlToText(html)
    if (text.length < 200) {
      throw new Error('Page trop pauvre en texte (site 100% JavaScript ?) : décrivez plutôt votre produit manuellement')
    }
    return { url: url.toString(), title, description, text }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Le site met trop de temps à répondre : réessayez ou décrivez votre produit manuellement')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
