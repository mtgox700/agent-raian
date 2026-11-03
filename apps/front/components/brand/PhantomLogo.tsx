/**
 * Phantera logo pieces: the « Arrêt net » mark and the lowercase
 * « phantera » wordmark (identity chosen 2026-10-11, replacing the tiger
 * head). Export names are kept so BrandLogo and its consumers do not change.
 */

import { cn } from '@/lib/utils'
import { PhanteraMark } from './PhanteraMark'

/* ─────────────────────────────────────────────
   EMBLEM: the mark alone
───────────────────────────────────────────── */
interface PhantomEmblemProps {
  /** Rendered size in px (square). */
  size: number
  className?: string
}

export function PhantomEmblem({ size, className }: PhantomEmblemProps) {
  return <PhanteraMark size={size} className={className} />
}

/* ─────────────────────────────────────────────
   WORDMARK: « phantera », lowercase
───────────────────────────────────────────── */
interface PhantomWordmarkProps {
  fontSize?: number
  className?: string
}

export function PhantomWordmark({ fontSize = 22, className }: PhantomWordmarkProps) {
  return (
    <span
      className={cn('font-display font-bold leading-none tracking-tight text-white select-none', className)}
      style={{ fontSize }}
    >
      phantera
    </span>
  )
}

/* ─────────────────────────────────────────────
   NAV LOGO: mark + wordmark for the navbar
───────────────────────────────────────────── */
interface PhantomLogoNavProps {
  className?: string
}

export function PhantomLogoNav({ className, ping = false }: PhantomLogoNavProps & { ping?: boolean }) {
  // The mark is framed to the cap height of the wordmark so both read as one
  // object; 0.08em of optical offset seats the strokes on the baseline.
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <PhanteraMark size={22} cropped ping={ping} className="translate-y-[1px]" />
      <PhantomWordmark fontSize={21} />
    </div>
  )
}

/* ─────────────────────────────────────────────
   BADGE PILL: mark + wordmark in a pill
───────────────────────────────────────────── */
interface PhantomLogoBadgeProps {
  className?: string
}

export function PhantomLogoBadge({ className }: PhantomLogoBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
        'bg-obsidian border border-cyan/30',
        className,
      )}
    >
      <PhantomEmblem size={20} />
      <PhantomWordmark fontSize={15} />
    </div>
  )
}
