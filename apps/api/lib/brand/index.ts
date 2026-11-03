/**
 * Active brand resolution: build-time, per deployment.
 *
 * NEXT_PUBLIC_BRAND is inlined by Next.js at build time (client AND server),
 * so each Vercel project ships exactly one brand:
 *   • Phantera project -> NEXT_PUBLIC_BRAND unset or 'phantera' (safe default)
 *   • Spar-x project   -> NEXT_PUBLIC_BRAND=sparx
 *
 * Import `brand` everywhere a name/color/CTA/legal string used to be hardcoded.
 */

import type { BrandConfig } from './types'
import { phanteraBrand } from './phantera'
import { sparxBrand } from './sparx'

export const brand: BrandConfig =
  process.env.NEXT_PUBLIC_BRAND === 'sparx' ? sparxBrand : phanteraBrand

/** Convenience flags for the rare brand-specific branches (use sparingly). */
export const isSparx = brand.key === 'sparx'
export const isPhantera = brand.key === 'phantera'

export type { BrandConfig, BrandKey, BrandMode } from './types'
