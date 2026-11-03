import { Container, Photo } from '@/components/ui'
import { Logo } from '@/components/brand/Logo'
import { identity, landing } from '@/lib/content'

/** The breath of the page: the brand's tagline and what its mark means. Hidden when the brand has none. */
export function Signature() {
  const { signature } = landing
  if (!signature) return null
  return (
    <section aria-label={signature.ariaLabel} className="border-t border-line py-20 md:py-28">
      <Container className="grid items-center gap-12 md:grid-cols-12">
        <blockquote className="md:col-span-7">
          <Logo className="[&_svg]:h-14" />
          <p className="mt-10 text-balance font-display text-[clamp(2rem,4.4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
            {identity.tagline}
          </p>
          <footer className="mt-6 max-w-prose leading-relaxed text-quiet">{signature.caption}</footer>
        </blockquote>
        <Photo photo="signature" ratio="4 / 5" sizes="(max-width: 768px) 100vw, 440px" position="center 55%" className="md:col-span-5" />
      </Container>
    </section>
  )
}
