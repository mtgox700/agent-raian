/**
 * BrandLogo: brand-switched logo components.
 *
 * Consumers (Navbar, Footer, auth…) import from HERE, never from PhantomLogo
 * or SparxLogo directly. The active brand is resolved at build time, so the
 * unused brand's logo code is tree-shaken out of the deployment bundle.
 *
 * API is the PhantomLogo one (Emblem size / Wordmark fontSize / LogoNav /
 * Badge): SparxLogo mirrors it 1:1.
 */

import { isSparx } from '@/lib/brand'
import {
  PhantomEmblem,
  PhantomWordmark,
  PhantomLogoNav,
  PhantomLogoBadge,
} from './PhantomLogo'
import {
  SparxEmblem,
  SparxWordmark,
  SparxLogoNav,
  SparxLogoBadge,
} from './SparxLogo'

export const BrandEmblem    = isSparx ? SparxEmblem    : PhantomEmblem
export const BrandWordmark  = isSparx ? SparxWordmark  : PhantomWordmark
export const BrandLogoNav   = isSparx ? SparxLogoNav   : PhantomLogoNav
export const BrandLogoBadge = isSparx ? SparxLogoBadge : PhantomLogoBadge
