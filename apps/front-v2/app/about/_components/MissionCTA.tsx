// Server Component. The about page's closing call to action.
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants, Container, Heading } from '@/components/ui'

export function MissionCTA() {
  return (
    <section className="border-t border-line py-20 md:py-28" aria-labelledby="mission-title">
      <Container>
        <Heading id="mission-title" className="max-w-[22ch]">
          Prospectez comme vous aimeriez être prospecté.
        </Heading>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-quiet">
          Une campagne lancée en quelques minutes, des messages que vous pouvez relire, et une séquence qui
          s&apos;arrête dès qu&apos;on vous répond.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'group gap-2' })}>
            Commencer gratuitement
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link href="/#pricing" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Voir les tarifs
          </Link>
        </div>
      </Container>
    </section>
  )
}
