// Server Component: the hero is plain HTML (the H1 is the LCP and paints
// with the first byte). Only the scene's player hydrates, after idle.
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { BrandHeadline, BRAND_EYEBROW, BRAND_LEAD } from './BrandHeadline'
import { MarketSort } from './scenes/MarketSort'
import { landing } from '@/lib/marketing/content'

// Verifiable product facts only (Reality Lock). "Conforme RGPD" stays off
// until the founder settles that claim (STATE.md, 2026-10-10).
const { guarantees, primaryCta, secondaryCta } = landing.hero

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border pt-28 md:pt-36" aria-labelledby="hero-title">
      <div className="mx-auto grid max-w-[1200px] gap-14 px-5 pb-20 md:px-8 lg:grid-cols-12 lg:gap-10 lg:pb-28">
        <div className="lg:col-span-7 lg:pt-6">
          <h1 id="hero-title">
            <span className="block font-mono text-sm text-muted">{BRAND_EYEBROW}</span>{' '}
            <span className="mt-6 block font-display text-[clamp(2.6rem,5.4vw,4.25rem)] font-semibold leading-[1] tracking-[-0.045em] text-white">
              <BrandHeadline />
            </span>
          </h1>

          <p className="mt-8 max-w-[34rem] text-lg leading-relaxed text-muted">
            {BRAND_LEAD}
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'group gap-2' })}>
              {primaryCta}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              {secondaryCta}
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-muted">
            {guarantees.map((g) => (
              <li key={g} className="flex items-center gap-2">
                <span className="h-px w-3 bg-cyan/60" aria-hidden="true" />
                {g}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-5">
          <MarketSort />
        </div>
      </div>
    </section>
  )
}
