import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { StructuredData } from '@/components/seo/StructuredData'
import { brand } from '@/lib/brand'
import { EditorialPhoto } from '@/components/marketing/EditorialPhoto'
import { ARTICLE_COVERS } from '@/lib/marketing/photos'
import {
  TOPIC_LABELS,
  articles,
  formatFrenchDate,
  getArticle,
  lastModified,
  readingMinutes,
  relatedArticles,
  toIsoDateTime,
  type Article,
  type ArticleBlock,
} from '@/lib/marketing/blog'

export const dynamicParams = false

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }))
}

interface PageProps {
  params: Promise<{ slug: string }>
}

const articleUrl = (article: Article) => `${brand.url}/blog/${article.slug}`

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const article = getArticle((await params).slug)
  if (!article) return {}
  const url = articleUrl(article)
  return {
    title: article.title,
    description: article.description,
    authors: [{ name: article.author.name, url: article.author.url }],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: article.title,
      description: article.description,
      siteName: brand.name,
      publishedTime: toIsoDateTime(article.publishedOn),
      modifiedTime: toIsoDateTime(lastModified(article)),
      authors: [article.author.url],
      tags: article.topics.map((topic) => TOPIC_LABELS[topic]),
    },
  }
}

function schemaFor(article: Article) {
  const url = articleUrl(article)
  const faq = article.faq?.length
    ? [{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: article.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      }]
    : []
  return [
    ...faq,
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: brand.name, item: brand.url },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${brand.url}/blog` },
        { '@type': 'ListItem', position: 3, name: article.title, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.description,
      datePublished: toIsoDateTime(article.publishedOn),
      dateModified: toIsoDateTime(lastModified(article)),
      keywords: article.topics.map((topic) => TOPIC_LABELS[topic]).join(', '),
      articleSection: TOPIC_LABELS[article.topics[0]],
      citation: article.sources.map((source) => source.url),
      image: `${url}/opengraph-image`,
      inLanguage: 'fr-FR',
      mainEntityOfPage: url,
      author: { '@type': 'Person', name: article.author.name, url: article.author.url },
      publisher: { '@type': 'Organization', name: brand.name, url: brand.url },
    },
  ]
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="mt-14 font-display text-[1.65rem] font-semibold leading-tight tracking-[-0.025em] text-white">{block.text}</h2>
    case 'ul':
      return (
        <ul className="mt-5 space-y-3 text-white/80">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-[0.85em] h-px w-3 shrink-0 bg-cyan" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="mt-5 list-decimal space-y-3 pl-6 text-white/80 marker:font-mono marker:text-sm marker:text-cyan">
          {block.items.map((item) => <li key={item}>{item}</li>)}
        </ol>
      )
    case 'callout':
      return (
        <aside className="mt-10 border-l-2 border-cyan py-1 pl-6">
          <p className="font-display text-xl font-semibold tracking-[-0.02em] text-white">{block.title}</p>
          <p className="mt-2 leading-relaxed text-white/80">{block.text}</p>
        </aside>
      )
    default:
      return <p className="mt-5 leading-[1.75] text-white/80">{block.text}</p>
  }
}

function RelatedArticles({ article }: { article: Article }) {
  const related = relatedArticles(article)
  if (related.length === 0) return null
  return (
    <section className="mt-14 text-base" aria-labelledby="related-title">
      <h2 id="related-title" className="font-mono text-sm text-muted">À lire aussi</h2>
      <ul className="mt-4 border-t border-border">
        {related.map((other) => (
          <li key={other.slug} className="border-b border-border">
            <Link href={`/blog/${other.slug}`} className="group block py-5">
              <span className="font-display text-lg font-semibold tracking-[-0.02em] text-white transition-colors group-hover:text-cyan">{other.title}</span>
              <span className="mt-1 block text-sm text-muted">{other.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function ArticlePage({ params }: PageProps) {
  const article = getArticle((await params).slug)
  if (!article) notFound()

  return (
    <>
      <StructuredData schema={schemaFor(article)} />
      <Navbar />
      <main id="main-content">
        <article className="mx-auto max-w-[46rem] px-5 pb-24 pt-28 text-[1.0625rem] md:px-8 md:pt-36">
          <nav aria-label="Fil d'Ariane" className="font-mono text-xs text-muted">
            <Link href="/" className="hover:text-white">{brand.name}</Link>
            {' / '}
            <Link href="/blog" className="hover:text-white">Blog</Link>
          </nav>

          <header className="mt-6">
            <h1 className="font-display text-[clamp(2.1rem,4.6vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.04em] text-white">{article.title}</h1>
            <p className="mt-6 font-mono text-xs leading-relaxed text-muted">
              <a href={article.author.url} rel="noopener author" target="_blank" className="text-white underline decoration-muted underline-offset-4 hover:decoration-cyan">
                {article.author.name}
              </a>
              {', fondateur de '}{brand.name}{' · '}
              <time dateTime={article.publishedOn}>{formatFrenchDate(article.publishedOn)}</time>
              {article.updatedOn && article.updatedOn !== article.publishedOn && (
                <>{' · mis à jour le '}<time dateTime={article.updatedOn}>{formatFrenchDate(article.updatedOn)}</time></>
              )}
              {` · ${readingMinutes(article)} min de lecture`}
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1" aria-label="Thèmes">
              {article.topics.map((topic) => (
                <li key={topic}>
                  <Link href={`/blog/theme/${topic}`} className="font-mono text-xs text-cyan underline decoration-transparent underline-offset-4 transition-colors hover:decoration-cyan">
                    {TOPIC_LABELS[topic]}
                  </Link>
                </li>
              ))}
            </ul>
          </header>

          {ARTICLE_COVERS[article.slug] && (
            <EditorialPhoto photo={ARTICLE_COVERS[article.slug]} ratio="16 / 9" sizes="(max-width: 768px) 100vw, 736px" credit="below" className="mt-10" />
          )}

          <div className="mt-10 border-t border-border pt-4">
            {article.blocks.map((block, index) => <Block key={index} block={block} />)}
          </div>

          {article.faq && article.faq.length > 0 && (
            <section className="mt-14" aria-labelledby="faq-title">
              <h2 id="faq-title" className="font-display text-[1.65rem] font-semibold tracking-[-0.025em] text-white">Questions fréquentes</h2>
              <dl className="mt-6 border-t border-border">
                {article.faq.map((item) => (
                  <div key={item.question} className="border-b border-border py-5">
                    <dt className="font-medium text-white">{item.question}</dt>
                    <dd className="mt-2 text-base leading-relaxed text-muted">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="mt-14 rounded-[10px] border border-border bg-obsidian p-6 text-base">
            <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-white">Tester avec nous pendant 30 jours</h2>
            <p className="mt-2 leading-relaxed text-muted">
              Un pilote mis en place avec vous : votre client idéal, votre domaine vérifié, une première campagne que vous relisez avant l&apos;envoi.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/pilote" className={buttonVariants()}>
                Voir le pilote
              </Link>
              <Link href="/sign-up" className={buttonVariants({ variant: 'outline' })}>
                Essayer seul, gratuitement
              </Link>
            </div>
          </section>

          {article.sources.length > 0 && (
            <section className="mt-12 text-base">
              <h2 className="font-mono text-sm text-muted">Sources</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {article.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} rel="noopener nofollow" target="_blank" className="text-white underline decoration-muted underline-offset-4 hover:decoration-cyan">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <RelatedArticles article={article} />

          <p className="mt-10 font-mono text-xs text-muted">
            {`Une erreur dans cet article ? Écrivez à contact@${brand.domain}, nous la corrigeons.`}
          </p>
        </article>
      </main>
      <Footer />
    </>
  )
}
