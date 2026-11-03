/**
 * Active brand resolution: build-time, per deployment.
 *
 * NEXT_PUBLIC_BRAND is inlined by Next.js at build time (client AND server),
 * so each front deployment ships exactly one brand (unset or unknown: the
 * default theme's brand).
 *
 * Import `brand` everywhere a name/color/CTA/legal string used to be hardcoded.
 */

import { getContent, type Locale } from '@phantera/content'
import { themeByKey } from '@phantera/themes'
import type { BrandConfig } from './types'
import { BRAND_KEYS, BRAND_LOCALES, DEFAULT_BRAND, type BrandKey } from './keys.generated'

/**
 * A brand is data: its paint (packages/themes/themes/<key>.json) and its
 * texts (packages/content/content/<key>/<locale>/). Adding one never needs a
 * component change: see scripts/new-brand.mjs.
 */
export function buildBrand(key: BrandKey): BrandConfig {
  const locale = BRAND_LOCALES[key][0] as Locale
  const { $schema: _schema, ...identity } = getContent(key, locale, 'identity')
  const theme = themeByKey(key)
  return { key, locale, mode: theme.mode, colors: theme.colors, ...identity }
}

const requested = process.env.NEXT_PUBLIC_BRAND
export const brand: BrandConfig = buildBrand(
  (BRAND_KEYS as readonly string[]).includes(requested ?? '') ? (requested as BrandKey) : DEFAULT_BRAND,
)

/** Convenience flags for the rare brand-specific branches (use sparingly). */
export const isSparx = brand.key === 'sparx'
export const isPhantera = brand.key === 'phantera'

export type { BrandConfig, BrandKey, BrandMode } from './types'
export { BRAND_KEYS, DEFAULT_BRAND }
