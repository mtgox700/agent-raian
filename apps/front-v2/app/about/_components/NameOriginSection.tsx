// Server Component. Where the name comes from, and what the mark draws.
import { Container, Eyebrow } from '@/components/ui'
import { EditorialPhoto } from '@/lib/marketing/EditorialPhoto'

const roots = [
  {
    word: 'Phantom',
    origin: 'anglais, « fantôme »',
    text: 'Ce qui travaille sans bruit. Les agents cherchent, vérifient et écrivent en arrière-plan ; vous ne voyez que ce qui compte : les réponses.',
  },
  {
    word: 'Panthera',
    origin: 'latin, le genre des grands félins',
    text: 'La patience et la précision : attendre le bon compte et le bon moment plutôt que d’écrire à tout le monde.',
  },
]

export function NameOriginSection() {
  return (
    <section className="border-t border-line py-20 md:py-28" aria-labelledby="name-title">
      <Container>
        <Eyebrow index={2}><span id="name-title">Le nom et le signe</span></Eyebrow>

        <p className="mt-10 font-display text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-ink">
          Phantom <span className="text-quiet">+</span> Panthera <span className="text-quiet">=</span>{' '}
          <span className="text-accent">Phantera</span>
        </p>

        <EditorialPhoto photo="fog" ratio="21 / 9" sizes="(max-width: 1200px) 100vw, 1136px" className="mt-14" />

        <div className="mt-14 grid border-t border-line md:grid-cols-2">
          {roots.map((root, i) => (
            <div key={root.word} className={'py-8 ' + (i === 1 ? 'border-t border-line md:border-l md:border-t-0 md:pl-10' : 'md:pr-10')}>
              <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">{root.word}</p>
              <p className="mt-1 font-mono text-xs text-quiet">{root.origin}</p>
              <p className="mt-4 leading-relaxed text-quiet">{root.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid items-center gap-8 border-t border-line pt-12 md:grid-cols-12">
          <div className="md:col-span-3">
            <svg viewBox="28 26 136 148" className="h-auto w-24 text-ink" aria-hidden="true">
              <g transform="translate(-7 0)" stroke="currentColor" strokeWidth={18} strokeLinecap="round" fill="none">
                <path d="M48 160 L92 40" />
                <path d="M86 160 L130 40" />
                <path d="M124 160 L140 116" />
              </g>
              <circle cx={149} cy={72} r={11} className="fill-accent" />
            </svg>
          </div>
          <p className="max-w-prose leading-relaxed text-quiet md:col-span-9">
            Le signe tient en trois traits et un point. Les deux premiers partent, le troisième s&apos;arrête court :
            c&apos;est la séquence qui se tait quand on vous répond. Le point, c&apos;est la réponse.
          </p>
        </div>
      </Container>
    </section>
  )
}
