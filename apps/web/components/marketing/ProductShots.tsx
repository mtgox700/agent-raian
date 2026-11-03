// Server Component. The application as it is: real captures of the dashboard,
// taken in the test environment on demonstration data (and labelled so),
// fanned out like screens on a desk. The front screen is the one the visitor
// came for; the two behind it say there is more. On a phone they stack flat.
import Image from 'next/image'
import { cn } from '@/lib/utils'

export interface ProductShot {
  src: string
  width: number
  height: number
  alt: string
  /** What the screen is, in the product's words. */
  label: string
}

interface ProductShotsProps {
  shots: readonly [ProductShot, ProductShot, ProductShot]
  className?: string
}

function Frame({ shot, className, priority = false }: { shot: ProductShot; className?: string; priority?: boolean }) {
  return (
    <figure className={cn('overflow-hidden rounded-[10px] border border-border bg-obsidian shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]', className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-white/15" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-white/15" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-white/15" aria-hidden="true" />
        <figcaption className="ml-2 truncate font-mono text-[11px] text-muted">{shot.label}</figcaption>
      </div>
      <Image
        src={shot.src}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        sizes="(max-width: 768px) 100vw, 760px"
        quality={82}
        priority={priority}
        className="block h-auto w-full"
      />
    </figure>
  )
}

export function ProductShots({ shots, className }: ProductShotsProps) {
  const [front, left, right] = shots
  return (
    <div className={cn('product-shots', className)}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-10">
        <h3 className="font-display text-[clamp(1.5rem,2.6vw,2rem)] font-semibold tracking-[-0.03em] text-white">
          L&apos;application, telle qu&apos;elle est.
        </h3>
        <p className="max-w-[28rem] text-sm leading-relaxed text-muted">
          Les alertes de l&apos;Analyste, vos campagnes avec leurs vrais chiffres, et chaque réponse classée.
        </p>
      </div>
      <div className="grid gap-6 md:hidden">
        {shots.map((shot) => <Frame key={shot.src} shot={shot} />)}
      </div>
      <div className="relative hidden md:block md:aspect-[16/9]" role="group" aria-label="Captures de l'application">
        <Frame shot={left} className="product-shot product-shot--left absolute left-0 top-[6%] w-[52%]" />
        <Frame shot={right} className="product-shot product-shot--right absolute right-0 top-[6%] w-[52%]" />
        <Frame shot={front} className="product-shot product-shot--front absolute left-1/2 top-[10%] w-[68%] -translate-x-1/2" />
      </div>
      <p className="mt-4 font-mono text-xs text-muted">
        Captures de l&apos;application, prises dans notre environnement de test. Données de démonstration.
      </p>
    </div>
  )
}
