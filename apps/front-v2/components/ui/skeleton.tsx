import { cn } from '@/lib/utils'

/**
 * The shape of what is coming, so nothing jumps when data lands. Opacity
 * pulse only, stopped under reduced motion. Decorative: the container that
 * waits carries `aria-busy` and a label.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface motion-reduce:animate-none', className)} aria-hidden="true" />
}
