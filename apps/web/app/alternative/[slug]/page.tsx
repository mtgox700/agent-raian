import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { StructuredData } from '@/components/seo/StructuredData'
import { brand } from '@/lib/brand'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { comparisons, getComparison, PHANTERA_LIMITS, VERIFIED_ON, type Comparison } from '@/lib/marketing/comparisons'

/** French typography: no line break before « : » and « ? ». */
const NBSP = String.fromCharCode(160)

export const dynamicParams = false

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }))
}

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const comparison = getComparison((await params).slug)
  if (!comparison) return {}
  const url = `${brand.url}/alternative/${comparison.slug}`
  const title = `Alternative à ${comparison.name} : comparatif factuel`
  const description = `${comparison.name} ou ${brand.name} ? Prix, canaux, IA et garde-fous comparés à partir des pages officielles (vérifié le ${VERIFIED_ON}), et quand choisir l'un ou l'autre.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'article', url, title: `${title} | ${brand.name}`, description, siteName: brand.name },
  }
}

function schemaFor(comparison: Comparison) {
  const url = `${brand.url}/alternative/${comparison.slug}`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: brand.name, item: brand.url },
        { '@type': 'ListItem', position: 2, name: 'Comparatifs', item: `${brand.url}/alternative` },
        { '@type': 'ListItem', position: 3, name: `Alternative à ${comparison.name}`, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: comparison.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
  ]
}

function ComparisonTable({ comparison }: { comparison: Comparison }) {
  return (
    <div className="overflow-x-auto border-y border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">{`${comparison.name} et ${brand.name} comparés`}</caption>
        <thead className="font-mono text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Critère</th>
            <th scope="col" className="px-4 py-3 font-medium">{comparison.name}</th>
            <th scope="col" className="px-4 py-3 font-medium text-cyan">{brand.name}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-t border-border">
          {comparison.rows.map((row) => (
            <tr key={row.label} className="align-top">
              <th scope="row" className="px-4 py-4 font-medium text-white">{row.label}</th>
              <td className="px-4 py-4 text-muted">{row.competitor}</td>
              <td className="px-4 py-4 text-white/85">{row.phantera}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-3 text-white/80">
      {items.map((item) => (
        <li key={item} className="flex gap-3 leading-relaxed">
          <span className="mt-[0.7em] h-px w-3 shrink-0 bg-cyan" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function AlternativePage({ params }: PageProps) {
  const comparison = getComparison((await params).slug)
  if (!comparison) notFound()

  return (
    <>
      <StructuredData schema={schemaFor(comparison)} />
      <Navbar />
      <main id="main-content">
        <article className="mx-auto max-w-[60rem] px-5 pb-24 pt-28 md:px-8 md:pt-36">
          <nav aria-label="Fil d'Ariane" className="font-mono text-xs text-muted">
            <Link href="/" className="hover:text-white">{brand.name}</Link>
            {' / '}
            <Link href="/alternative" className="hover:text-white">Comparatifs</Link>
          </nav>

          <header className="mt-6">
            <h1 className="font-display text-[clamp(2.2rem,4.8vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-white">
              {`Alternative à ${comparison.name}${NBSP}: ${comparison.name} ou ${brand.name}${NBSP}?`}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted">{comparison.summary}</p>
            <p className="mt-4 font-mono text-xs leading-relaxed text-muted">
              {`Informations sur ${comparison.name} lues sur ses pages officielles le ${VERIFIED_ON}, dans la devise affichée par l'éditeur (taxes non précisées sauf mention). Les prix de ${brand.name} sont hors taxes. Les prix peuvent avoir changé : vérifiez-les avant de décider.`}
            </p>
          </header>

          <section className="mt-14">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-white">En bref</h2>
            <div className="mt-6"><ComparisonTable comparison={comparison} /></div>
          </section>

          <section className="mt-14 grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-white">{`Choisissez ${comparison.name} si…`}</h2>
              <Bullets items={comparison.chooseCompetitor} />
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-white">{`Choisissez ${brand.name} si…`}</h2>
              <Bullets items={comparison.choosePhantera} />
            </div>
          </section>

          <section className="mt-14">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-white">{`Ce que ${brand.name} ne fait pas`}</h2>
            <Bullets items={PHANTERA_LIMITS} />
          </section>

          <section className="mt-14">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-white">Questions fréquentes</h2>
            <div className="mt-6 space-y-6">
              {comparison.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold text-white">{faq.question}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-14 rounded-[10px] border border-border bg-obsidian p-6 md:p-8">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-white">{`Essayer ${brand.name}`}</h2>
            <p className="mt-3 leading-relaxed text-muted">
              {`La formule gratuite permet de tester la recherche de décideurs (${PLAN_CONFIG.FREE.leadsLimit} leads par mois) et une première campagne, sans carte bancaire.`}
            </p>
            <Link
              href="/sign-up"
              className={buttonVariants({ className: 'mt-6' })}
            >
              Créer un compte gratuit
            </Link>
          </section>

          <section className="mt-14">
            <h2 className="font-mono text-sm text-muted">Sources</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {comparison.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} rel="noopener nofollow" target="_blank" className="text-white underline decoration-border underline-offset-4 hover:decoration-cyan">
                    {source.label}
                  </a>
                  <span className="text-muted">{` (consulté le ${VERIFIED_ON})`}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-xs text-muted">
              {`${comparison.name} est une marque de son éditeur, citée à titre de comparaison. Une erreur dans cette page ? Écrivez à contact@${brand.domain}, nous la corrigeons.`}
            </p>
          </section>
        </article>
      </main>
      <Footer />
    </>
  )
}
