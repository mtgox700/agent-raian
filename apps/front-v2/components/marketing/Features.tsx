import Image from 'next/image'
import { Section } from '@/components/ui'
import { anchorLabel, landing } from '@/lib/content'

/** What the tool really does, then the proof: three real dashboard captures. */
export function Features() {
  const { features } = landing
  return (
    <Section id="features" index={2} eyebrow={anchorLabel('#features')} title={features.title}>
      <ul className="mt-14 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {features.items.map((item, i) => (
          <li key={item.title} className="bg-canvas p-6 md:p-8">
            <p className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</p>
            <h3 className="mt-4 font-display text-xl font-semibold leading-snug tracking-[-0.02em] text-ink">{item.title}</h3>
            <p className="mt-3 leading-relaxed text-quiet">{item.text}</p>
          </li>
        ))}
      </ul>
      {features.productShots && (
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {features.productShots.map((shot, i) => (
            <figure key={shot.src} className={i === 0 ? 'md:col-span-3' : ''}>
              <div className="overflow-hidden rounded-lg border border-line bg-raised">
                <Image
                  src={shot.src}
                  width={shot.width}
                  height={shot.height}
                  alt={shot.alt}
                  sizes={i === 0 ? '(max-width: 1216px) 100vw, 1152px' : '(max-width: 768px) 100vw, 560px'}
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="mt-3 flex items-center gap-3 font-mono text-xs text-quiet">
                <span className="h-px w-3 bg-accent" aria-hidden="true" />
                {shot.label}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Section>
  )
}
