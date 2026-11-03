/**
 * Every visible text of body n°2, from @phantera/content for the active brand
 * and locale. Components import these documents; they never hold copy.
 */
import { getContent } from '@phantera/content'
import { brand } from '@/lib/brand'

export const identity = getContent(brand.key, brand.locale, 'identity')
export const navigation = getContent(brand.key, brand.locale, 'navigation')
export const landing = getContent(brand.key, brand.locale, 'landing')
export const faq = getContent(brand.key, brand.locale, 'faq')
export const auth = getContent(brand.key, brand.locale, 'auth')

/** `{domain}` in a content href is the brand's domain (contact mailto). */
export const resolveHref = (href: string) => href.replaceAll('{domain}', identity.domain)

export const contactHref = `mailto:contact@${identity.domain}`

/**
 * Routes that exist in body n°2 today. Content menus list body n°1's whole
 * site (blog, legal, pilot...); a link is shown here only once its page is
 * built, so nothing points to a 404.
 */
const BUILT = ['/', '/sign-in', '/sign-up', '/onboarding', '/dashboard']
export function isBuilt(href: string): boolean {
  if (href.startsWith('mailto:') || href.startsWith('#') || href.startsWith('/#')) return true
  return BUILT.includes(href.split(/[?#]/)[0])
}

/** The navbar label of an anchor ('#pricing' -> 'Tarifs'): section eyebrows reuse it. */
export function anchorLabel(anchor: `#${string}`): string | undefined {
  return navigation.navbar.links.find((l) => l.href.endsWith(anchor))?.label
}
