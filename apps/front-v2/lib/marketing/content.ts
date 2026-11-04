/**
 * Texts of the marketing pages for the active brand, from @phantera/content
 * (packages/content/content/<brand>/<locale>/{landing,navigation,faq}.json).
 */
import { getContent } from '@phantera/content'
import { brand } from '@/lib/brand'

export const landing = getContent(brand.key, brand.locale, 'landing')
export const navigation = getContent(brand.key, brand.locale, 'navigation')
export const faqContent = getContent(brand.key, brand.locale, 'faq')

/** Content hrefs may name the brand's domain as `{domain}` (contact mailto). */
export function resolveHref(href: string): string {
  return href.replace('{domain}', brand.domain)
}
