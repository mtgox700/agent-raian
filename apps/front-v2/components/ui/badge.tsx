import { cn } from '@/lib/utils'

/**
 * A status: a dot and a word. The tone carries the meaning, the same on every screen:
 *   accent   the machine is working (active, contacted)
 *   signal   a person answered (replied, qualified, meeting)
 *   success  done and good (converted, delivered)
 *   warning  needs a look (paused)
 *   danger   failed or lost (bounced, error)
 *   ai       written or classified by the AI
 *   neutral  everything else (draft, completed, queued)
 */
export type BadgeTone = 'accent' | 'signal' | 'success' | 'warning' | 'danger' | 'ai' | 'neutral'

const TONE: Record<BadgeTone, { dot: string; text: string; ring: string }> = {
  accent:  { dot: 'bg-accent',  text: 'text-accent',  ring: 'border-accent/30' },
  signal:  { dot: 'bg-signal',  text: 'text-signal',  ring: 'border-signal/30' },
  success: { dot: 'bg-success', text: 'text-success', ring: 'border-success/30' },
  warning: { dot: 'bg-warning', text: 'text-warning', ring: 'border-warning/30' },
  danger:  { dot: 'bg-danger',  text: 'text-danger',  ring: 'border-danger/30' },
  ai:      { dot: 'bg-ai',      text: 'text-ai',      ring: 'border-ai/30' },
  neutral: { dot: 'bg-quiet',   text: 'text-quiet',   ring: 'border-line' },
}

export function Badge({ tone = 'neutral', live = false, dot = true, className, children }: {
  tone?: BadgeTone
  /** A live process: the dot breathes (never under reduced motion). */
  live?: boolean
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  const t = TONE[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] leading-5', t.ring, t.text, className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot, live && 'motion-safe:animate-pulse')} aria-hidden="true" />}
      {children}
    </span>
  )
}
