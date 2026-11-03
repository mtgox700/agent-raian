// Button styles as plain classes, in a module WITHOUT 'use client', so Server
// Components can style a <Link> or an <a> as a button. (An export of a
// 'use client' module is a client reference on the server: calling
// buttonVariants() there throws.) components/ui/button.tsx re-exports it.
import { cva, type VariantProps } from 'class-variance-authority'
import { isSparx } from '@/lib/brand'

// Spar-x brand signature (spar-x.fr): PILL buttons. Phantera: 6px instrument
// corners, no glow (Legends League: depth comes from contrast, not halos).
export const buttonVariants = cva(
  `inline-flex items-center justify-center whitespace-nowrap ${isSparx ? 'rounded-full' : 'rounded-md'} text-sm font-semibold font-body transition-[background-color,border-color,color,transform] duration-200 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:pointer-events-none disabled:opacity-50 cursor-pointer`,
  {
    variants: {
      variant: {
        default:
          `bg-cyan text-void ${isSparx ? 'hover:bg-cyan-deep' : 'hover:bg-cyan-300'} active:scale-[0.98]`,
        outline:
          'border border-white/15 bg-transparent text-white hover:bg-white/[0.04] hover:border-white/30 active:scale-[0.98]',
        ghost:
          'text-white/70 hover:text-white hover:bg-surface active:scale-[0.98]',
        gold: 'bg-gold text-void hover:bg-gold/90 active:scale-[0.98]',
        secondary:
          'bg-surface text-white hover:bg-surface-2 border border-border active:scale-[0.98]',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        default: 'h-10 px-5 py-2',
        lg: 'h-12 px-8 py-3 text-base',
        xl: 'h-14 px-10 py-4 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
