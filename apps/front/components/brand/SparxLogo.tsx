/**
 * Spar-x logo components: faithful vector recreation of the official logo
 * (founder-provided logo-sparx.svg): a teal (#006D71) rounded square holding a
 * four-pointed sparkle with a thin circle outline, next to a serif wordmark.
 *
 * Recreated geometrically (instead of embedding the 20KB clip-path export) so
 * it stays crisp at every size, themeable, and a few hundred bytes. Colors use
 * the brand CSS variables where possible so the emblem also works on teal
 * backgrounds (inverted variant).
 *
 * API mirrors PhantomLogo (Emblem / Wordmark / LogoNav / Badge) so BrandLogo
 * can switch brands without touching consumers.
 */

interface SparxEmblemProps {
  size?: number
  className?: string
  /** 'solid' = teal box + white sparkle (default); 'inverse' = white box + teal sparkle */
  variant?: 'solid' | 'inverse'
}

/** Four-pointed sparkle path (concave star) centered in a 100×100 viewBox. */
const SPARKLE_PATH =
  'M50 12 C53 38 62 47 88 50 C62 53 53 62 50 88 C47 62 38 53 12 50 C38 47 47 38 50 12 Z'

export function SparxEmblem({ size = 40, className, variant = 'solid' }: SparxEmblemProps) {
  const box = variant === 'solid' ? '#006D71' : '#FBFFFE'
  const mark = variant === 'solid' ? '#FBFFFE' : '#006D71'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="96" height="96" rx="14" fill={box} />
      <path d={SPARKLE_PATH} fill={mark} fillRule="evenodd" />
      <circle cx="50" cy="50" r="21" stroke={mark} strokeWidth="1.6" fill="none" opacity="0.9" />
    </svg>
  )
}

interface SparxWordmarkProps {
  fontSize?: number
  className?: string
}

export function SparxWordmark({ fontSize = 22, className }: SparxWordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-serif), Georgia, serif',
        fontWeight: 700,
        fontSize,
        letterSpacing: '-0.01em',
        color: 'var(--text-base, #1A1A1A)',
        lineHeight: 1,
      }}
    >
      Spar-x
    </span>
  )
}

interface SparxLogoNavProps {
  className?: string
  /** Phantera-only signal ring; accepted so BrandLogoNav keeps one API. */
  ping?: boolean
}

export function SparxLogoNav({ className }: SparxLogoNavProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <SparxEmblem size={32} />
      <SparxWordmark fontSize={20} />
    </span>
  )
}

interface SparxLogoBadgeProps {
  className?: string
}

export function SparxLogoBadge({ className }: SparxLogoBadgeProps) {
  return <SparxEmblem size={28} className={className} />
}
