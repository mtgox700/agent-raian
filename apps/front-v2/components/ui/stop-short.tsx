import { cn } from '@/lib/utils'

/**
 * The signature of body n°2: « Arrêt net ». Two long strokes, a third that
 * stops short, and the point: a sequence that goes silent the moment someone
 * replies. It opens the page (animated once, on load) and closes it (still).
 *
 * Pure HTML and CSS: no JavaScript, no image. Motion rules in globals.css:
 * transform and opacity only, once, and none under prefers-reduced-motion.
 * Decorative: hidden from assistive technology (the words carry the meaning).
 */
export function StopShort({ animate = false, className }: { animate?: boolean; className?: string }) {
  const strokes = ['flex-[5]', 'flex-[5]', 'flex-[1.4]']
  return (
    <div
      className={cn('stop-short flex w-full items-center gap-[2.5%]', className)}
      data-animate={animate ? '' : undefined}
      aria-hidden="true"
    >
      {strokes.map((grow, i) => (
        <span
          key={grow + i}
          className={cn('stop-short-stroke block h-[3px] rounded-full bg-ink', i === 2 && 'bg-ink/70', grow)}
          style={{ '--i': i } as React.CSSProperties}
        />
      ))}
      <span className="relative ml-[1.5%] block size-3 shrink-0 md:size-4">
        <span className="stop-short-ring absolute inset-0 rounded-full border-2 border-accent" />
        <span className="stop-short-dot absolute inset-0 rounded-full bg-accent" />
      </span>
      {/* The silence after the reply: room on purpose. */}
      <span className="block flex-[3]" />
    </div>
  )
}
