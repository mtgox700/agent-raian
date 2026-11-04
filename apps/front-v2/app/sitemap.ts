import { MetadataRoute } from 'next'
import { brand } from '@/lib/brand'
import { comparisons } from '@/lib/marketing/comparisons'
import { TOPICS, articles, articlesForTopic, lastModified as articleModified, sortedArticles } from '@/lib/marketing/blog'

const SITE = brand.url

// Only REAL, indexable pages. The previous sitemap pointed at /pricing, /blog
// and /features: none of which exist as pages (they are anchor sections on the
// landing), so crawlers hit 404s. We list the actual public routes instead.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  const newest = sortedArticles()[0]
  const latestArticleDate = newest ? new Date(articleModified(newest)) : undefined
  return [
    { url: SITE,                       lastModified, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${SITE}/about`,            lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/alternative`,      lastModified, changeFrequency: 'monthly', priority: 0.6 },
    ...comparisons.map((c) => ({
      url: `${SITE}/alternative/${c.slug}`, lastModified, changeFrequency: 'monthly' as const, priority: 0.7,
    })),
    { url: `${SITE}/pilote`,           lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/blog`,             lastModified: latestArticleDate ?? lastModified, changeFrequency: 'weekly', priority: 0.7 },
    ...articles.map((a) => ({
      url: `${SITE}/blog/${a.slug}`, lastModified: new Date(articleModified(a)), changeFrequency: 'monthly' as const, priority: 0.6,
    })),
    ...TOPICS.map((topic) => ({ topic, list: articlesForTopic(topic) }))
      .filter(({ list }) => list.length > 0)
      .map(({ topic, list }) => ({
        url: `${SITE}/blog/theme/${topic}`, lastModified: new Date(articleModified(list[0])), changeFrequency: 'weekly' as const, priority: 0.5,
      })),
    { url: `${SITE}/legal/privacy`,    lastModified, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${SITE}/legal/terms`,      lastModified, changeFrequency: 'yearly',  priority: 0.3 },
  ]
}
