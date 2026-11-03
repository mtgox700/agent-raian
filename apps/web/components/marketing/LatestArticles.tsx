import Link from 'next/link'
import { formatFrenchDate, sortedArticles } from '@/lib/marketing/blog'
import { ARTICLE_COVERS } from '@/lib/marketing/photos'
import { EditorialPhoto } from './EditorialPhoto'

const SHOWN = 3

/**
 * The newest blog articles on the home page: plain links in the static HTML,
 * so crawlers reach every new article from the most linked page of the site.
 */
export function LatestArticles() {
  const latest = sortedArticles().slice(0, SHOWN)
  if (latest.length === 0) return null

  return (
    <section aria-labelledby="latest-articles-title" className="border-b border-border py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="latest-articles-title" className="max-w-[40rem] font-display text-[clamp(2rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
            Prospecter mieux, règles et chiffres à l&apos;appui
          </h2>
          <Link href="/blog" className="text-sm text-white underline decoration-muted underline-offset-4 transition-colors hover:decoration-cyan">
            Tous les articles
          </Link>
        </div>
        <ul className="mt-12 grid border-t border-border md:grid-cols-3">
          {latest.map((article, i) => (
            <li key={article.slug} className={i > 0 ? 'border-t border-border md:border-l md:border-t-0' : ''}>
              <Link href={`/blog/${article.slug}`} className={'group flex h-full flex-col py-8 md:px-6 ' + (i === 0 ? 'md:pl-0' : '')}>
                {ARTICLE_COVERS[article.slug] && (
                  <EditorialPhoto photo={ARTICLE_COVERS[article.slug]} ratio="3 / 2" sizes="(max-width: 768px) 100vw, 360px" credit="none" className="mb-5" />
                )}
                <time dateTime={article.publishedOn} className="font-mono text-xs text-muted">
                  {formatFrenchDate(article.publishedOn)}
                </time>
                <span className="mt-3 font-display text-xl font-semibold leading-snug tracking-[-0.02em] text-white transition-colors group-hover:text-cyan">
                  {article.title}
                </span>
                <span className="mt-3 text-sm leading-relaxed text-muted">{article.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
