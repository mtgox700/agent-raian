// Server Component. The closing call to action, under the brand's signature,
// beside the moment the product exists for: someone reads a reply.
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { brand } from '@/lib/brand'
import { EditorialPhoto } from './EditorialPhoto'
import { landing } from '@/lib/marketing/content'

const { title, lead, primaryCta, secondaryCta, perks } = landing.contact

export function Contact() {
  return (
    <section className="py-24 md:py-32" aria-labelledby="contact-title">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 md:grid-cols-12 md:gap-10 md:px-8">
        <div className="md:col-span-7">
        <h2 id="contact-title" className="max-w-[52rem] font-display text-[clamp(2.25rem,5.5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
          {title}
        </h2>
        <p className="mt-6 max-w-[36rem] text-lg leading-relaxed text-muted">
          {lead}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'group gap-2' })}>
            {primaryCta}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <a href={`mailto:contact@${brand.domain}`} className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            {secondaryCta}
          </a>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-muted">
          {perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2">
              <span className="h-px w-3 bg-cyan/60" aria-hidden="true" />
              {perk}
            </li>
          ))}
        </ul>
        </div>
        <div className="md:col-span-5">
          <EditorialPhoto photo="reply" ratio="4 / 5" sizes="(max-width: 768px) 100vw, 460px" position="60% center" />
        </div>
      </div>
    </section>
  )
}
