import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared look of every form control (input, select, textarea): a hairline
 * box on the canvas, the accent on focus, danger when `aria-invalid`.
 */
export const controlClass =
  'w-full rounded-md border border-line bg-canvas text-sm text-ink placeholder:text-quiet/70 ' +
  'transition-colors duration-200 ease-signal hover:border-quiet/60 focus:border-accent focus-visible:outline-offset-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger'

const SIZES = { sm: 'h-9 px-3', md: 'h-11 px-3.5' } as const

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: keyof typeof SIZES
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, size = 'md', ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, SIZES[size], className)} {...props} />
})

/** `aria-describedby` for a control wrapped in <Field id=…>: its hint and its error, when shown. */
export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }): string | undefined {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
}

/**
 * Label, control, hint and error, wired by id. The control is the child; give
 * it `id={id}`, `aria-invalid={!!error}` and `aria-describedby={describedBy(id, { hint, error })}`.
 */
export function Field({ id, label, hint, error, className, children }: {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs leading-relaxed text-quiet">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}
