// Server Component. Where the name comes from, and what the mark draws. The
// fog is the phantom: what works out of sight, between the trees.
import { PhanteraMark } from '@/components/brand/PhanteraMark'
import { EditorialPhoto } from '@/components/marketing/EditorialPhoto'

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
    <section className="border-b border-border py-24 md:py-32" aria-labelledby="name-title">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <h2 id="name-title" className="font-mono text-sm text-muted">Le nom et le signe</h2>

        <p className="mt-10 font-display text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
          Phantom <span className="text-muted">+</span> Panthera <span className="text-muted">=</span>{' '}
          <span className="text-cyan">Phantera</span>
        </p>

        <EditorialPhoto photo="fog" ratio="21 / 9" sizes="(max-width: 1200px) 100vw, 1136px" className="mt-14" />

        <div className="mt-14 grid border-t border-border md:grid-cols-2">
          {roots.map((root, i) => (
            <div key={root.word} className={'py-8 ' + (i === 1 ? 'border-t border-border md:border-l md:border-t-0 md:pl-10' : 'md:pr-10')}>
              <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-white">{root.word}</p>
              <p className="mt-1 font-mono text-xs text-muted">{root.origin}</p>
              <p className="mt-4 leading-relaxed text-muted">{root.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid items-center gap-8 border-t border-border pt-12 md:grid-cols-12">
          <div className="md:col-span-3">
            <PhanteraMark size={120} cropped className="h-auto w-24" />
          </div>
          <p className="max-w-[40rem] leading-relaxed text-muted md:col-span-9">
            Le signe tient en trois traits et un point. Les deux premiers partent, le troisième s&apos;arrête court :
            c&apos;est la séquence qui se tait quand on vous répond. Le point, c&apos;est la réponse.
          </p>
        </div>
      </div>
    </section>
  )
}
