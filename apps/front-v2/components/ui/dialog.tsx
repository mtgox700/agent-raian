'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A modal on the native <dialog>: the browser traps focus, makes the page
 * inert, closes on Escape and gives focus back to the opener. Controlled:
 * `open` shows it, every close (Escape, backdrop, close button) calls
 * `onClose`. Client only: import from '@/components/ui/dialog', not the barrel,
 * so pages without a dialog ship no JavaScript for it.
 */
export function Dialog({ open, onClose, title, description, closeLabel, footer, size = 'md', className, children }: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  /** Accessible name of the × button (the screen's own words, e.g. « Fermer »). */
  closeLabel: string
  /** Actions, right-aligned; the primary one last. */
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-raised p-0 text-ink backdrop:bg-canvas/70 backdrop:backdrop-blur-[2px]',
        { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size],
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>
              {description && <p id={descId} className="mt-1 text-sm leading-relaxed text-quiet">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
