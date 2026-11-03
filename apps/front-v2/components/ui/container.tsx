import { cn } from '@/lib/utils'

/** The page column: 76rem max, the same gutters everywhere. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-page px-5 md:px-8', className)}>{children}</div>
}
