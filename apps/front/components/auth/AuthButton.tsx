'use client'

import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  variant?: 'primary' | 'outline' | 'ghost'
}

// Plain button, same language as the site's buttons: no shimmer, no spring.
export const AuthButton = forwardRef<HTMLButtonElement, AuthButtonProps>(function AuthButton({
  children,
  loading = false,
  variant = 'primary',
  className,
  disabled,
  ...props
}, ref) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      className={cn(
        'relative flex h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold',
        'transition-[background-color,border-color,color,transform] duration-200 ease-signal active:scale-[0.99]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian',
        variant === 'primary' && 'bg-cyan text-void hover:bg-cyan-300',
        variant === 'outline' && 'border border-border bg-transparent text-white hover:border-white/30',
        variant === 'ghost' && 'bg-transparent text-muted hover:text-white',
        className,
      )}
      disabled={isDisabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
})
