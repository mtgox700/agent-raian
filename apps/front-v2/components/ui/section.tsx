import { cn } from '@/lib/utils'
import { Container } from './container'
import { Eyebrow } from './eyebrow'
import { Heading } from './heading'

/**
 * A step of the page. Every landing section is numbered (`index`) and titled;
 * the title gets an id and labels the <section>.
 */
export function Section({
  id, index, eyebrow, title, intro, className, children, ariaLabel,
}: {
  id?: string
  index?: number
  eyebrow?: React.ReactNode
  title?: React.ReactNode
  intro?: React.ReactNode
  className?: string
  ariaLabel?: string
  children: React.ReactNode
}) {
  const titleId = id ? `${id}-title` : undefined
  return (
    <section
      id={id}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
      className={cn('border-t border-line py-20 md:py-28', className)}
    >
      <Container>
        {(index !== undefined || eyebrow) && <Eyebrow index={index}>{eyebrow}</Eyebrow>}
        {title && <Heading id={titleId} className="mt-6 max-w-[22ch]">{title}</Heading>}
        {intro && <p className="mt-6 max-w-prose text-lg leading-relaxed text-quiet">{intro}</p>}
        {children}
      </Container>
    </section>
  )
}
