// Server Component. The about page's closing call to action.
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'

export function MissionCTA() {
  return (
    <section className="py-24 md:py-32" aria-labelledby="mission-title">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <h2 id="mission-title" className="max-w-[48rem] font-display text-[clamp(2.25rem,5.5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
          Prospectez comme vous aimeriez être prospecté.
        </h2>
        <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted">
          Une campagne lancée en quelques minutes, des messages que vous pouvez relire, et une séquence qui
          s&apos;arrête dès qu&apos;on vous répond.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'group gap-2' })}>
            Commencer gratuitement
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link href="/#pricing" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Voir les tarifs
          </Link>
        </div>
      </div>
    </section>
  )
}
