import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants, Container, Eyebrow, Heading, StopShort } from '@/components/ui'
import { landing } from '@/lib/content'

/**
 * The opening. The headline says the promise; under it the sequence draws
 * itself, two long strokes, a short one, and stops on the point: the reply.
 * Text first in the DOM and painted without waiting for anything (LCP).
 */
export function Hero() {
  const { hero } = landing
  return (
    <section aria-labelledby="hero-title" className="pb-16 pt-16 md:pb-24 md:pt-28">
      <Container>
        <Eyebrow>{hero.eyebrow}</Eyebrow>
        <Heading as="h1" size="hero" id="hero-title" className="mt-8 max-w-[16ch]">
          {hero.headline.first}
          <br />
          <span className="text-accent">{hero.headline.highlight}</span>
        </Heading>
        <StopShort animate className="mt-12 max-w-[46rem] md:mt-16" />
        <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-12">
          <p className="text-lg leading-relaxed text-quiet md:col-span-6 md:text-xl">{hero.lead}</p>
          <div className="md:col-span-5 md:col-start-8">
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'group' })}>
                {hero.primaryCta}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className={buttonVariants({ variant: 'outline', size: 'lg' })}>{hero.secondaryCta}</a>
            </div>
            <ul className="mt-6 grid gap-2 font-mono text-xs text-quiet">
              {hero.guarantees.map((g) => (
                <li key={g} className="flex items-center gap-3">
                  <span className="h-px w-3 bg-accent" aria-hidden="true" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  )
}
