/**
 * The Phantera mark « Arrêt net » (chosen 2026-10-11): three strokes that
 * stop short, and the cyan point where the message stops. Source of truth:
 * .war-room/social/assets/phantera-logo-arret-net.svg. Inline SVG, so it
 * stays sharp at every size and costs no request.
 */

import { cn } from '@/lib/utils'

export const MARK_CYAN = '#00D4FF'
export const MARK_LIGHT = '#F4F4F6'
export const MARK_DARK = '#050508'
/** Darker cyan of the light-background version, for contrast on white. */
export const MARK_CYAN_ON_LIGHT = '#0089A8'

interface PhanteraMarkProps {
  size: number
  /** 'light' strokes on dark backgrounds (default), 'dark' on light ones. */
  tone?: 'light' | 'dark'
  className?: string
  title?: string
  /**
   * Frame the drawing tightly (no change to the drawing itself): the full
   * 200x200 canvas leaves the strokes at half their size beside a wordmark.
   */
  cropped?: boolean
  /** One-shot ring emitted by the point, the signal the mark stands for. */
  ping?: boolean
}

/** Bounding box of the strokes (18px round caps) and the point. */
const CROPPED_VIEWBOX = '28 26 136 148'

export function PhanteraMark({ size, tone = 'light', className, title, cropped = false, ping = false }: PhanteraMarkProps) {
  const stroke = tone === 'light' ? MARK_LIGHT : MARK_DARK
  const point = tone === 'light' ? MARK_CYAN : MARK_CYAN_ON_LIGHT
  const width = cropped ? Math.round((size * 136) / 148) : size
  return (
    <svg
      width={width}
      height={size}
      viewBox={cropped ? CROPPED_VIEWBOX : '0 0 200 200'}
      overflow="visible"
      className={cn('flex-shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g transform="translate(-7 0)" stroke={stroke} strokeWidth={18} strokeLinecap="round" fill="none">
        <path d="M48 160 L92 40" />
        <path d="M86 160 L130 40" />
        <path d="M124 160 L140 116" />
      </g>
      {ping && <circle cx={149} cy={72} r={11} fill="none" stroke={point} strokeWidth={3} className="mark-ping" />}
      <circle cx={149} cy={72} r={11} fill={point} />
    </svg>
  )
}
