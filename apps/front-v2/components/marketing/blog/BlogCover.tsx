import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { BlogCover as Cover } from '@/lib/marketing/blog-photos'

/** An article cover in a fixed ratio box (no layout shift), credited below unless it is a list thumbnail. */
export function BlogCover({
  cover, ratio, sizes, credit = false, priority = false, className,
}: { cover: Cover; ratio: string; sizes: string; credit?: boolean; priority?: boolean; className?: string }) {
  return (
    <figure className={className}>
      <div className="relative overflow-hidden rounded-lg border border-line bg-raised" style={{ aspectRatio: ratio }}>
        <Image src={cover.src} alt={cover.alt} fill sizes={sizes} priority={priority} quality={78} className="object-cover" />
      </div>
      {credit && (
        <figcaption className={cn('mt-2 text-right font-mono text-[11px] text-quiet')}>
          <a href={cover.page} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink">
            {`Photo : ${cover.author}, Unsplash`}
          </a>
        </figcaption>
      )}
    </figure>
  )
}
