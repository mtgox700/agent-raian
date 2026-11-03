'use client'

/**
 * The one overlay of the dashboard: a modal dialog (centred) or a drawer
 * (right edge), both on the native <dialog> element opened with showModal().
 * The browser gives what the nine hand-made overlays lacked: the page behind
 * is inert (focus cannot leave), Escape closes, the dialog sits in the top
 * layer, and focus goes back to the control that opened it. Labelled by its
 * title, opaque scrim, no blur, page scroll locked while open (globals.css). Motion is a short fade and slide, off with
 * reduced motion (globals.css .ui-dialog).
 */

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** One line under the title. */
  description?: ReactNode
  children: ReactNode
  /** Buttons row at the bottom, right-aligned. */
  footer?: ReactNode
  variant?: 'modal' | 'drawer'
  /** Max width of a modal, or width of a drawer. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Keep the dialog open on Escape and outside clicks (an action is running). */
  busy?: boolean
  className?: string
}

const MODAL_WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const
const DRAWER_WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' } as const

export function Dialog({
  open, onClose, title, description, children, footer, variant = 'modal', size = 'md', busy = false, className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  // Latest props for the native listeners, without re-subscribing them.
  const openRef = useRef(open)
  const busyRef = useRef(busy)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    openRef.current = open
    busyRef.current = busy
    onCloseRef.current = onClose
  })

  // A scrim click closes only when the press also started on the scrim: a
  // drag from inside the panel that ends outside it is not a dismissal.
  const pressedOnScrim = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Escape fires "cancel": let the parent decide, never close behind its back.
    const onCancel = (e: Event) => {
      e.preventDefault()
      if (!busyRef.current) onCloseRef.current()
    }
    // Chrome honours preventDefault on "cancel" once per user activation, so a
    // second Escape can close the element natively. If the parent still wants
    // it open (an action is running), reopen it; otherwise tell the parent.
    const onNativeClose = () => {
      if (!openRef.current) return
      if (busyRef.current) el.showModal()
      else onCloseRef.current()
    }
    el.addEventListener('cancel', onCancel)
    el.addEventListener('close', onNativeClose)
    return () => {
      el.removeEventListener('cancel', onCancel)
      el.removeEventListener('close', onNativeClose)
    }
  }, [])

  const drawer = variant === 'drawer'

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // A click on the scrim lands on the <dialog> itself, outside its panel.
      onPointerDown={(e) => { pressedOnScrim.current = e.target === e.currentTarget }}
      onClick={(e) => {
        const fromScrim = pressedOnScrim.current
        pressedOnScrim.current = false
        if (fromScrim && e.target === e.currentTarget && !busy) onClose()
      }}
      className={cn(
        'ui-dialog m-0 max-h-none max-w-none bg-transparent p-0 text-white backdrop:bg-void/80',
        drawer ? 'ui-dialog--drawer ml-auto h-dvh w-full' : 'ui-dialog--modal mx-auto my-auto w-[calc(100%-2rem)]',
        drawer ? DRAWER_WIDTH[size] : MODAL_WIDTH[size],
      )}
    >
      {open && (
        <div
          className={cn(
            'flex flex-col border border-border bg-obsidian',
            drawer ? 'h-full border-y-0 border-r-0' : 'max-h-[min(88dvh,52rem)] rounded-[10px]',
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-semibold tracking-[-0.02em] text-white">{title}</h2>
              {description && <p id={descId} className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Fermer"
              className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-40"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
