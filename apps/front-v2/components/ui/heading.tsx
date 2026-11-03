import { cn } from '@/lib/utils'

const SIZES = {
  hero: 'text-[clamp(2.5rem,6.4vw,5.25rem)] leading-[0.98] tracking-[-0.045em]',
  section: 'text-[clamp(2rem,4.2vw,3.25rem)] leading-[1.04] tracking-[-0.035em]',
  card: 'text-xl leading-snug tracking-[-0.02em]',
} as const

/** Display type. The level is the document outline; the size is the look. */
export function Heading({
  as: Tag = 'h2', size = 'section', id, className, children,
}: {
  as?: 'h1' | 'h2' | 'h3' | 'p'
  size?: keyof typeof SIZES
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag id={id} className={cn('text-balance font-display font-semibold text-ink', SIZES[size], className)}>
      {children}
    </Tag>
  )
}
