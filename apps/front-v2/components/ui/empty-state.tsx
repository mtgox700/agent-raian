import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Nothing to show yet: say so plainly, say what will appear, offer the one
 * action that fills it. Words come from the screen (body n°1's strings).
 */
export function EmptyState({ icon: Icon, title, children, action, align = 'center', className }: {
  icon?: LucideIcon
  title: React.ReactNode
  /** One or two sentences: what will appear here, and when. */
  children?: React.ReactNode
  action?: React.ReactNode
  align?: 'center' | 'start'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 py-8', align === 'center' ? 'items-center text-center' : 'items-start', className)}>
      {Icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface">
          <Icon className="h-5 w-5 text-quiet" aria-hidden="true" />
        </span>
      )}
      <div className="max-w-[28rem]">
        <p className="text-sm font-medium text-ink">{title}</p>
        {children && <div className="mt-1 text-sm leading-relaxed text-quiet">{children}</div>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
