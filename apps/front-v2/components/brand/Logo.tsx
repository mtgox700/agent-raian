import Image from 'next/image'
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

const LOGO_FILES: Partial<Record<string, { src: string; width: number; height: number }>> = {
  sparx: { src: '/brand/sparx/logo.svg', width: 623, height: 207 },
}

export function Logo({ className }: { className?: string }) {
  const file = LOGO_FILES[brand.key]
  if (file) {
    return <Image src={file.src} width={file.width} height={file.height} alt={brand.name} className={cn('h-8 w-auto', className)} />
  }
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-ink', className)}>
      {brand.key === 'phantera' && <PhanteraMark />}
      <span className="font-display text-lg font-semibold tracking-[-0.02em]">{brand.name}</span>
    </span>
  )
}
