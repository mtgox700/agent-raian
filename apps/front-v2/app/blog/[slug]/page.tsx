import type { Metadata } from 'next'
import Link from 'next/link'
import { Container, Heading, buttonVariants } from '@/components/ui'
import { isBuilt } from '@/lib/content'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { StructuredData } from '@/components/marketing/blog/StructuredData'
import { ArticleBlockView } from '@/components/marketing/blog/ArticleBody'
import { BlogCover } from '@/components/marketing/blog/BlogCover'
import { Breadcrumb } from '@/components/marketing/blog/Breadcrumb'
import { brand } from '@/lib/brand'
import { ARTICLE_COVERS } from '@/lib/marketing/blog-photos'
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

function RelatedArticles({ article }: { article: Article }) {
  const related = relatedArticles(article)
  if (related.length === 0) return null
  return (
    <section className="mt-14 text-base" aria-labelledby="related-title">
      <h2 id="related-title" className="font-mono text-sm text-quiet">À lire aussi</h2>
      <ul className="mt-4 border-t border-line">
        {related.map((other) => (
          <li key={other.slug} className="border-b border-line">
            <Link href={`/blog/${other.slug}`} className="group block py-5">
              <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink transition-colors group-hover:text-accent">{other.title}</span>
              <span className="mt-1 block text-sm text-quiet">{other.description}</span>
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
  const cover = ARTICLE_COVERS[article.slug]

  return (
    <>
      <StructuredData schema={schemaFor(article)} />
      <Navbar />
      <main id="main-content">
        <Container>
        <article className="mx-auto max-w-[46rem] pb-24 pt-16 text-[1.0625rem] md:pt-24">
          <Breadcrumb section={{ href: '/blog', label: 'Blog' }} />

          <header className="mt-6">
            <Heading as="h1" className="text-[clamp(2.1rem,4.6vw,3.25rem)] leading-[1.06]">{article.title}</Heading>
            <p className="mt-6 font-mono text-xs leading-relaxed text-quiet">
              <a href={article.author.url} rel="noopener author" target="_blank" className="text-ink underline decoration-line underline-offset-4 hover:decoration-accent">
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
                  <Link href={`/blog/theme/${topic}`} className="font-mono text-xs text-accent underline decoration-transparent underline-offset-4 transition-colors hover:decoration-accent">
                    {TOPIC_LABELS[topic]}
                  </Link>
                </li>
              ))}
            </ul>
          </header>

          {cover && <BlogCover cover={cover} ratio="16 / 9" sizes="(max-width: 768px) 100vw, 736px" credit priority className="mt-10" />}

          <div className="mt-10 border-t border-line pt-4">
            {article.blocks.map((block, index) => <ArticleBlockView key={index} block={block} />)}
          </div>

          {article.faq && article.faq.length > 0 && (
            <section className="mt-14" aria-labelledby="faq-title">
              <h2 id="faq-title" className="font-display text-[1.65rem] font-semibold tracking-[-0.025em] text-ink">Questions fréquentes</h2>
              <dl className="mt-6 border-t border-line">
                {article.faq.map((item) => (
                  <div key={item.question} className="border-b border-line py-5">
                    <dt className="font-medium text-ink">{item.question}</dt>
                    <dd className="mt-2 text-base leading-relaxed text-quiet">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="mt-14 rounded-lg border border-line bg-raised p-6 text-base">
            <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">Tester avec nous pendant 30 jours</h2>
            <p className="mt-2 leading-relaxed text-quiet">
              Un pilote mis en place avec vous : votre client idéal, votre domaine vérifié, une première campagne que vous relisez avant l&apos;envoi.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {isBuilt('/pilote') && (
                <Link href="/pilote" className={buttonVariants()}>
                  Voir le pilote
                </Link>
              )}
              <Link href="/sign-up" className={buttonVariants({ variant: isBuilt('/pilote') ? 'outline' : 'primary' })}>
                Essayer seul, gratuitement
              </Link>
            </div>
          </section>

          {article.sources.length > 0 && (
            <section className="mt-12 text-base">
              <h2 className="font-mono text-sm text-quiet">Sources</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {article.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} rel="noopener nofollow" target="_blank" className="text-ink underline decoration-line underline-offset-4 hover:decoration-accent">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <RelatedArticles article={article} />

          <p className="mt-10 font-mono text-xs text-quiet">
            {`Une erreur dans cet article ? Écrivez à contact@${brand.domain}, nous la corrigeons.`}
          </p>
        </article>
        </Container>
      </main>
      <Footer />
    </>
  )
}
