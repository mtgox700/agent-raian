// Server Component. The breath of the page, where the tiger used to be: the
// brand's signature, the mark that draws it, and one photograph that says it
// (a lamp over a handwritten page: a message written with care, for someone).
import { brand } from '@/lib/brand'
import { landing } from '@/lib/marketing/content'
import { PhanteraMark } from '@/components/brand/PhanteraMark'
import { EditorialPhoto } from './EditorialPhoto'

export function Signature() {
  const { signature } = landing
  if (!signature) return null
  return (
    <section className="border-b border-border py-24 md:py-32" aria-label={signature.ariaLabel}>
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 md:grid-cols-12 md:gap-10 md:px-8">
        <div className="order-2 md:order-1 md:col-span-7">
          <PhanteraMark size={120} cropped className="h-auto w-20 md:w-24" />
          <blockquote className="mt-10">
            <p className="font-display text-[clamp(2rem,4.6vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-white">
              {brand.tagline}
            </p>
            <footer className="mt-6 max-w-[34rem] leading-relaxed text-muted">
              {signature.caption}
            </footer>
          </blockquote>
        </div>
        <div className="order-1 md:order-2 md:col-span-5">
          <EditorialPhoto photo="signature" ratio="4 / 5" sizes="(max-width: 768px) 100vw, 460px" position="center 55%" />
        </div>
      </div>
    </section>
  )
}
