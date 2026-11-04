// Server Component. The founder, his real photo and the bio already published
// on this page.
import Image from 'next/image'
import Link from 'next/link'
import { buttonVariants, Container, Eyebrow } from '@/components/ui'
import { brand } from '@/lib/brand'

const LINKEDIN = 'https://www.linkedin.com/in/ayoub-hammoudi-3251851b8'

const facts = ['Développeur full-stack', 'Intégration IA', 'Architecture logicielle', 'Indépendant depuis 2021']

export function FounderSection() {
  return (
    <section className="border-t border-line py-20 md:py-28" aria-labelledby="founder-title">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4">
          <Eyebrow index={3}><span id="founder-title">Le fondateur</span></Eyebrow>
          <figure className="mt-10 overflow-hidden rounded-lg border border-line bg-raised">
            <Image
              src="/founder.png"
              alt={`Ayoub Hammoudi, fondateur de ${brand.name}`}
              width={800}
              height={800}
              sizes="(max-width: 1024px) 100vw, 380px"
              className="aspect-square h-auto w-full object-cover"
            />
            <figcaption className="border-t border-line px-4 py-3">
              <span className="block font-medium text-ink">Ayoub Hammoudi</span>
              <span className="block font-mono text-xs text-quiet">{`Fondateur de ${brand.name}`}</span>
            </figcaption>
          </figure>
        </div>

        <div className="lg:col-span-7 lg:col-start-6 lg:pt-16">
          <p className="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
            « Je ne construis pas des produits. Je construis des machines qui pensent. »
          </p>
          <div className="mt-8 space-y-5 leading-relaxed text-quiet">
            <p>
              Depuis 2021, je travaille comme développeur full-stack indépendant : des interfaces au pixel près et des
              backends solides pour des startups et des scale-ups en Europe. Ce qui me distingue, ce n&apos;est pas la
              stack. C&apos;est l&apos;obsession d&apos;une architecture qui tient la charge, d&apos;une expérience qui
              convertit, et d&apos;un code qui ne ment pas.
            </p>
            <p>
              Quand les agents IA sont devenus un vrai paradigme d&apos;ingénierie, je ne me suis pas contenté
              d&apos;apprendre les outils. J&apos;ai plongé dans les moteurs de raisonnement : orchestration
              multi-agents, pipelines de récupération, classification d&apos;intention. J&apos;ai passé des mois à
              comprendre <em className="text-ink">pourquoi</em> les agents échouent avant d&apos;en construire qui
              n&apos;échouent pas.
            </p>
            <p>
              {brand.name} est la convergence de tout ce que je sais faire : une architecture propre, une IA qui fonctionne
              réellement en production, et une obsession du résultat plutôt que des fonctionnalités.
            </p>
          </div>

          <ul className="mt-8 flex flex-wrap gap-2">
            {facts.map((fact) => (
              <li key={fact} className="rounded border border-line px-2.5 py-1 font-mono text-xs text-quiet">
                {fact}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Suivre Ayoub sur LinkedIn
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            <Link href="/sign-up" className={buttonVariants({ size: 'lg' })}>
              {`Essayer ${brand.name}`}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}
