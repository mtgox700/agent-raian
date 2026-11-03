import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { controlClass } from './input'

const SIZES = { sm: 'h-9 pl-3 pr-9', md: 'h-11 pl-3.5 pr-10' } as const

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: keyof typeof SIZES
  /** Classes of the wrapper (width, margins); `className` styles the <select>. */
  wrapperClassName?: string
}

/** A native <select> (keyboard, mobile pickers and forms for free) with the control look. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, size = 'md', children, ...props }, ref,
) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(controlClass, SIZES[size], 'appearance-none truncate [&_optgroup]:bg-raised [&_option]:bg-raised', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-quiet" aria-hidden="true" />
    </div>
  )
})
