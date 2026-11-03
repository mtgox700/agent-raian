import { cn } from '@/lib/utils'

/**
 * The frame of every dashboard screen: an optional header (title, one line
 * of description, actions on the right) over padded content. Server
 * component; a screen renders `<AppPage title=… actions=…>…</AppPage>`.
 * The home page has its own greeting header and passes no title.
 */
export function AppPage({ title, description, actions, className, children }: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0">
            {title && <h1 className="truncate font-display text-lg font-semibold tracking-[-0.02em] text-ink md:text-xl">{title}</h1>}
            {description && <p className="mt-0.5 text-xs text-quiet md:text-sm">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2 md:gap-3">{actions}</div>}
        </div>
      )}
      <div className={cn('flex-1 p-4 md:p-6', className)}>{children}</div>
    </div>
  )
}
