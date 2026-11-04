// Server Component. One photograph in a fixed-ratio frame (CLS 0), credited
// where it stands, painted with the theme tokens only.
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { PHOTOS, type PhotoKey } from '@/lib/marketing/photos'

interface EditorialPhotoProps {
  photo: PhotoKey
  /** CSS aspect ratio of the frame, e.g. '16 / 9'. */
  ratio: string
  sizes: string
  /** Focal point of the crop. */
  position?: string
  priority?: boolean
  className?: string
}

export function EditorialPhoto({ photo, ratio, sizes, position = 'center', priority = false, className }: EditorialPhotoProps) {
  const p = PHOTOS[photo]
  return (
    <figure className={cn('relative overflow-hidden rounded-lg border border-line bg-raised', className)} style={{ aspectRatio: ratio }}>
      <Image src={p.src} alt={p.alt} fill sizes={sizes} priority={priority} quality={78} className="object-cover" style={{ objectPosition: position }} />
      <figcaption className="absolute bottom-2 right-2 rounded bg-canvas/80 px-2 py-1 font-mono text-[11px] text-quiet">
        <a href={p.page} className="hover:text-ink" rel="noopener noreferrer" target="_blank">{`Photo : ${p.author}, Unsplash`}</a>
      </figcaption>
    </figure>
  )
}
