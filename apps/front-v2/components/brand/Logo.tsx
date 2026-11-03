import Image from 'next/image'
import { themeByKey } from '@phantera/themes'
import { brand } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The brand's logo, painted with the theme tokens. Phantera's mark « Arrêt
 * net » is inline SVG (ink strokes, accent point); a brand with a logo file
 * uses it; any other brand gets its name as a wordmark. One rare branch on
 * brand.key, kept here so no other component needs one.
 */
function PhanteraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="28 26 136 148" className={cn('h-7 w-auto', className)} aria-hidden="true">
      <g transform="translate(-7 0)" stroke="currentColor" strokeWidth={18} strokeLinecap="round" fill="none">
        <path d="M48 160 L92 40" />
        <path d="M86 160 L130 40" />
        <path d="M124 160 L140 116" />
      </g>
      <circle cx={149} cy={72} r={11} className="fill-accent" />
    </svg>
  )
}

/** `onDark`: the file for a dark ground. `markWidth`: share of the width the emblem takes (left side). */
const LOGO_FILES: Partial<Record<string, { src: string; onDark?: string; width: number; height: number; markWidth: number }>> = {
  sparx: { src: '/brand/sparx/logo.svg', onDark: '/brand/sparx/logo-white.svg', width: 623, height: 207, markWidth: 0.21 },
}

/** Ground mode of the signed-in app ([data-app-shell]): a light brand may paint its app dark. */
const theme = themeByKey(brand.key)
const appMode = theme.appShellMode ?? theme.mode

/**
 * `surface="app"` inside [data-app-shell] (picks the file for the app's ground);
 * `markOnly` keeps the emblem alone (collapsed sidebar).
 */
export function Logo({ className, surface = 'page', markOnly = false }: { className?: string; surface?: 'page' | 'app'; markOnly?: boolean }) {
  const file = LOGO_FILES[brand.key]
  const mode = surface === 'app' ? appMode : theme.mode
  if (file) {
    const src = mode === 'dark' && file.onDark ? file.onDark : file.src
    if (markOnly) {
      // The emblem is the left part of the file: a box of its width crops the rest.
      return (
        <span className={cn('block h-8 overflow-hidden', className)} style={{ width: `${(2 * file.width * file.markWidth) / file.height}rem` }}>
          <Image src={src} width={file.width} height={file.height} alt={brand.name} className="h-8 w-auto max-w-none" />
        </span>
      )
    }
    return <Image src={src} width={file.width} height={file.height} alt={brand.name} className={cn('h-8 w-auto', className)} />
  }
  if (markOnly && brand.key === 'phantera') {
    return <span className={cn('inline-flex text-ink', className)} role="img" aria-label={brand.name}><PhanteraMark /></span>
  }
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-ink', className)}>
      {brand.key === 'phantera' && <PhanteraMark />}
      {!markOnly && <span className="font-display text-lg font-semibold tracking-[-0.02em]">{brand.name}</span>}
      {markOnly && brand.key !== 'phantera' && <span className="font-display text-lg font-semibold">{brand.name.charAt(0)}</span>}
    </span>
  )
}
