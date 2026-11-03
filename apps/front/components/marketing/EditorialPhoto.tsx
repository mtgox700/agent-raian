// Server Component. One photograph, served by next/image (AVIF/WebP, srcset,
// fixed ratio so CLS stays at 0), graded into the page with a dark veil, and
// credited where it stands. The ratio box is the layout; the image fills it.
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
  /** 'soft' darkens the edges, 'deep' lets text sit on the photo. */
  veil?: 'none' | 'soft' | 'deep'
  priority?: boolean
  className?: string
  children?: React.ReactNode
  /** Credit line under or over the photo. */
  credit?: 'below' | 'over' | 'none'
}

export function EditorialPhoto({
  photo, ratio, sizes, position = 'center', veil = 'soft', priority = false, className, children, credit = 'over',
}: EditorialPhotoProps) {
  const p = PHOTOS[photo]
  const creditLink = (tone: string) => (
    <a href={p.page} target="_blank" rel="noopener noreferrer" className={tone}>
      {`Photo : ${p.author}, Unsplash`}
    </a>
  )
  return (
    <figure className={className}>
      <div className="photo-frame relative isolate overflow-hidden rounded-[10px] border border-border bg-obsidian" style={{ aspectRatio: ratio }}>
        <Image
          src={p.src}
          alt={p.alt}
          fill
          sizes={sizes}
          priority={priority}
          quality={78}
          className="photo-grade object-cover"
          style={{ objectPosition: position }}
        />
        {veil !== 'none' && (
          <span
            className={cn(
              'pointer-events-none absolute inset-0',
              veil === 'soft'
                ? 'bg-[radial-gradient(120%_90%_at_50%_40%,transparent_40%,rgb(var(--c-void)/0.55)_100%)]'
                : 'bg-[linear-gradient(180deg,rgb(var(--c-void)/0.15)_0%,rgb(var(--c-void)/0.55)_55%,rgb(var(--c-void)/0.92)_100%)]',
            )}
            aria-hidden="true"
          />
        )}
        {children && <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">{children}</div>}
        {credit === 'over' && (
          <figcaption className="absolute right-3 top-3 rounded-[4px] bg-void/70 px-2 py-1 font-mono text-[10px] text-white/80">
            {creditLink('underline decoration-white/40 underline-offset-2 hover:decoration-white')}
          </figcaption>
        )}
      </div>
      {credit === 'below' && (
        <figcaption className="mt-2 text-right font-mono text-[10px] text-muted">
          {creditLink('underline decoration-muted underline-offset-2 hover:text-white')}
        </figcaption>
      )}
    </figure>
  )
}
