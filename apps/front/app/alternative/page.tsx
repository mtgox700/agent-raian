import type { Metadata } from 'next'
import Link from 'next/link'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { brand } from '@/lib/brand'
import { comparisons, VERIFIED_ON } from '@/lib/marketing/comparisons'
import { PageHeader } from '@/components/marketing/PageHeader'

export const metadata: Metadata = {
  title: 'Comparatifs des outils de prospection B2B',
  description: `${brand.name} comparé à lemlist, Waalaxy, La Growth Machine et Instantly : prix, canaux, IA et garde-fous, à partir des pages officielles.`,
  alternates: { canonical: `${brand.url}/alternative` },
}

export default function AlternativesIndexPage() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <PageHeader
          eyebrow="Comparatifs"
          title={`${brand.name} face aux autres outils de prospection`}
          lead={`Des comparatifs factuels, sourcés sur les pages officielles de chaque éditeur (vérifiées le ${VERIFIED_ON}), qui disent aussi quand un autre outil vous conviendra mieux.`}
          photo="fork"
          photoPosition="center 40%"
        />
        <div className="mx-auto max-w-[1200px] px-5 pb-24 md:px-8">
          <ul className="grid sm:grid-cols-2">
            {comparisons.map((c, i) => (
              <li key={c.slug} className={'border-b border-border ' + (i % 2 === 1 ? 'sm:border-l sm:pl-8' : 'sm:pr-8')}>
                <Link href={`/alternative/${c.slug}`} className="group block py-8">
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-white transition-colors group-hover:text-cyan">{`Alternative à ${c.name}`}</h2>
                  <p className="mt-3 leading-relaxed text-muted">{c.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </>
  )
}
