import Image from 'next/image'
import { cn } from '@/lib/utils'
import { PHOTOS, type PhotoKey } from '@/lib/photos'

/** An editorial photograph in a ratio box, with its credit (CREDITS.md). */
export function Photo({
  photo, ratio, sizes, position = 'center', className,
}: { photo: PhotoKey; ratio: string; sizes: string; position?: string; className?: string }) {
  const p = PHOTOS[photo]
  return (
    <figure className={cn('relative overflow-hidden rounded-lg border border-line bg-raised', className)} style={{ aspectRatio: ratio }}>
      <Image src={p.src} alt={p.alt} fill sizes={sizes} className="object-cover" style={{ objectPosition: position }} />
      <figcaption className="absolute bottom-2 right-2 rounded bg-canvas/80 px-2 py-1 font-mono text-[11px] text-quiet">
        <a href={p.page} className="hover:text-ink" rel="noopener noreferrer" target="_blank">{`Photo : ${p.author}, Unsplash`}</a>
      </figcaption>
    </figure>
  )
}
