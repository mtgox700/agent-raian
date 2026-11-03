import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { controlClass } from './input'

/** Multi-line text with the control look; grows by `rows`, resizable vertically. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props }, ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(controlClass, 'min-h-[5.5rem] resize-y px-3.5 py-2.5 leading-relaxed', className)} {...props} />
})
