import { cn } from '@/lib/utils'

/**
 * The dashboard's card: a raised surface on hairlines. `title` is the mono
 * label of the instrument (an <h2> by default), `action` sits on its right.
 */
export function Panel({ title, titleAs: Title = 'h2', meta, action, padded = true, className, children, ...rest }: {
  title?: React.ReactNode
  titleAs?: 'h2' | 'h3' | 'p'
  /** Quiet note beside the title (period, base of a figure). */
  meta?: React.ReactNode
  action?: React.ReactNode
  padded?: boolean
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={cn('rounded-lg border border-line bg-raised', padded && 'p-4 md:p-5', className)} {...rest}>
      {(title || action || meta) && (
        <header className={cn('flex flex-wrap items-center justify-between gap-2', padded ? 'mb-4' : 'border-b border-line px-4 py-3')}>
          {title && <Title className="font-mono text-xs font-medium text-ink">{title}</Title>}
          {(meta || action) && (
            <div className="flex items-center gap-3">
              {meta && <span className="font-mono text-xs text-quiet">{meta}</span>}
              {action}
            </div>
          )}
        </header>
      )}
      {children}
    </section>
  )
}
