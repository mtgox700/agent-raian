import { cn } from '@/lib/utils'

/**
 * The instrument voice: mono, small, quiet. `index` prints the step number
 * ('01') before the label: the landing reads as one numbered sequence.
 */
export function Eyebrow({ index, children, className }: { index?: number; children?: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-quiet', className)}>
      {index !== undefined && <span className="text-accent">{String(index).padStart(2, '0')}</span>}
      {index !== undefined && children && <span className="h-px w-6 bg-line" aria-hidden="true" />}
      {children}
    </p>
  )
}
