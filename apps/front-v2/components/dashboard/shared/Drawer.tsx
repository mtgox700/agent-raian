'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A side panel on the native <dialog> (the drawer variant body n°1 had;
 * ui/dialog has none): the browser traps focus, makes the page inert, closes
 * on Escape and gives focus back to the opener. Full height on the right; a
 * bottom sheet would hide the page on a phone just the same, so it is full
 * width there. Used by the campaign page, the Leads screen and the inbox.
 */
export function Drawer({ open, onClose, title, description, closeLabel, footer, size = 'md', children }: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  closeLabel: string
  footer?: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
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
        'm-0 ml-auto h-dvh max-h-dvh w-full border-0 border-l border-line bg-raised p-0 text-ink backdrop:bg-canvas/70 backdrop:backdrop-blur-[2px]',
        { md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-2xl' }[size],
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-start gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>
              {description && <div id={descId} className="mt-1 text-sm leading-relaxed text-quiet">{description}</div>}
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
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
