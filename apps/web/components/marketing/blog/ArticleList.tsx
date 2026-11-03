import Link from 'next/link'
import { TOPIC_LABELS, TOPICS, formatFrenchDate, lastModified, readingMinutes, toIsoDateTime, type Article, type Topic } from '@/lib/marketing/blog'
import { brand } from '@/lib/brand'
import { EditorialPhoto } from '@/components/marketing/EditorialPhoto'
import { ARTICLE_COVERS } from '@/lib/marketing/photos'

export function TopicNav({ current }: { current?: Topic }) {
  return (
    <nav aria-label="Thèmes du blog" className="mt-10 border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-x-6 gap-y-1">
        <li>
          <Link
            href="/blog"
            aria-current={current ? undefined : 'page'}
            className={`inline-block border-b px-0.5 py-1.5 text-sm transition-colors duration-200 ${current ? 'border-transparent text-muted hover:text-white' : 'border-cyan text-white'}`}
          >
            Tous les articles
          </Link>
        </li>
        {TOPICS.map((topic) => (
          <li key={topic}>
            <Link
              href={`/blog/theme/${topic}`}
              aria-current={current === topic ? 'page' : undefined}
              className={`inline-block border-b px-0.5 py-1.5 text-sm transition-colors duration-200 ${current === topic ? 'border-cyan text-white' : 'border-transparent text-muted hover:text-white'}`}
            >
              {TOPIC_LABELS[topic]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ArticleList({ list }: { list: Article[] }) {
  return (
    <ul className="mt-2">
      {list.map((article) => (
        <li key={article.slug} className="border-b border-border">
          <Link href={`/blog/${article.slug}`} className="group grid gap-3 py-8 md:grid-cols-12 md:gap-10">
            <div className="md:col-span-3">
              {ARTICLE_COVERS[article.slug] && (
                <EditorialPhoto photo={ARTICLE_COVERS[article.slug]} ratio="3 / 2" sizes="(max-width: 768px) 100vw, 260px" credit="none" className="mb-4 transition-opacity duration-200 group-hover:opacity-90" />
              )}
              <p className="font-mono text-xs leading-relaxed text-muted">
                <time dateTime={article.publishedOn}>{formatFrenchDate(article.publishedOn)}</time>
                <span className="block">{`${readingMinutes(article)} min de lecture`}</span>
              </p>
            </div>
            <div className="md:col-span-9">
              <h2 className="font-display text-[clamp(1.4rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.025em] text-white transition-colors duration-200 group-hover:text-cyan">
                {article.title}
              </h2>
              <p className="mt-3 max-w-[44rem] leading-relaxed text-muted">{article.description}</p>
              <p className="mt-3 font-mono text-xs text-muted">{article.topics.map((t) => TOPIC_LABELS[t]).join(', ')}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** schema.org Blog listing, so search engines and AI assistants see every post with its date. */
export function blogSchema(list: Article[], url: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name,
    url,
    inLanguage: 'fr-FR',
    publisher: { '@type': 'Organization', name: brand.name, url: brand.url },
    blogPost: list.map((article) => ({
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.description,
      url: `${brand.url}/blog/${article.slug}`,
      datePublished: toIsoDateTime(article.publishedOn),
      dateModified: toIsoDateTime(lastModified(article)),
      author: { '@type': 'Person', name: article.author.name, url: article.author.url },
    })),
  }
}
