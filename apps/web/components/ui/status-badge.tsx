// One status pill for the whole dashboard: a dot and a word, in the
// Instrument palette. Every screen used to keep its own colour map (violet
// for "contacté", pink for "converti"); the tone now carries the meaning.
//   signal  the machine is working (active, contacted)
//   human   a person answered (replied, qualified, meeting)
//   success done and good (converted, delivered)
//   warning needs a look (paused, nurture)
//   danger  failed or lost (bounced, error, lost)
//   neutral everything else (draft, completed, queued: waiting, not yet worked)
import { cn } from '@/lib/utils'

export type StatusTone = 'signal' | 'human' | 'success' | 'warning' | 'danger' | 'neutral'

const TONE: Record<StatusTone, { dot: string; text: string; ring: string }> = {
  signal:  { dot: 'bg-cyan',        text: 'text-cyan',        ring: 'border-cyan/25' },
  human:   { dot: 'bg-gold',        text: 'text-gold',        ring: 'border-gold/25' },
  success: { dot: 'bg-success-fg',  text: 'text-success-fg',  ring: 'border-success-fg/25' },
  warning: { dot: 'bg-warning',     text: 'text-warning',     ring: 'border-warning/25' },
  danger:  { dot: 'bg-danger',      text: 'text-danger',      ring: 'border-danger/25' },
  neutral: { dot: 'bg-muted',       text: 'text-muted',       ring: 'border-border' },
}

interface StatusBadgeProps {
  tone: StatusTone
  children: React.ReactNode
  /** A live process: the dot breathes (not with reduced motion). */
  live?: boolean
  className?: string
}

export function StatusBadge({ tone, children, live = false, className }: StatusBadgeProps) {
  const t = TONE[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] leading-5', t.ring, t.text, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot, live && 'motion-safe:animate-pulse')} aria-hidden="true" />
      {children}
    </span>
  )
}

/** Campaign status -> tone and French label. */
export const CAMPAIGN_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  active:    { tone: 'signal',  label: 'Active' },
  paused:    { tone: 'warning', label: 'En pause' },
  draft:     { tone: 'neutral', label: 'Brouillon' },
  completed: { tone: 'neutral', label: 'Terminée' },
  archived:  { tone: 'neutral', label: 'Archivée' },
}

/** Lead status -> tone and French label. */
export const LEAD_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  new:       { tone: 'neutral', label: 'Nouveau' },
  queued:    { tone: 'neutral', label: 'En file' },
  contacted: { tone: 'signal',  label: 'Contacté' },
  replied:   { tone: 'human',   label: 'A répondu' },
  qualified: { tone: 'human',   label: 'Qualifié' },
  converted: { tone: 'success', label: 'Converti' },
  lost:      { tone: 'danger',  label: 'Perdu' },
}
