import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants, Container, Heading, Photo, StopShort } from '@/components/ui'
import { contactHref, landing } from '@/lib/content'

/** The last step: the sequence, still this time, ends on its point. Then the call. */
export function Closing() {
  const { contact } = landing
  return (
    <section aria-labelledby="closing-title" className="border-t border-line py-20 md:py-28">
      <Container>
        <StopShort className="max-w-[46rem]" />
        <div className="mt-14 grid items-end gap-12 md:grid-cols-12">
          <div className="md:col-span-7">
            <Heading id="closing-title" className="max-w-[18ch]">{contact.title}</Heading>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-quiet">{contact.lead}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: 'lg', className: 'group' })}>
                {contact.primaryCta}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <a href={contactHref} className={buttonVariants({ variant: 'outline', size: 'lg' })}>{contact.secondaryCta}</a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-quiet">
              {contact.perks.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
          <Photo photo="reply" ratio="3 / 2" sizes="(max-width: 768px) 100vw, 460px" className="md:col-span-5" />
        </div>
      </Container>
    </section>
  )
}
