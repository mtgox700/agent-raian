import { describe, expect, it } from 'vitest'
import { TOPICS, articles, articlesForTopic, formatFrenchDate, getArticle, readingMinutes, relatedArticles, sortedArticles, toIsoDateTime, type Article } from './blog'
import { buildRss, escapeXml } from './rss'

const BANNED = [
  'révolution', 'game changer', 'booster', 'boostez', 'dans un monde où', 'n\'hésitez pas',
  'incroyable', 'ultime', 'growth hacking', 'conforme rgpd', 'eu-safe', 'hébergé en europe',
]

function allText(article: Article): string {
  return [
    article.title,
    article.description,
    ...article.blocks.flatMap((b) => ('items' in b ? b.items : 'title' in b ? [b.title, b.text] : [b.text])),
    ...(article.faq ?? []).flatMap((f) => [f.question, f.answer]),
  ].join(' ').toLowerCase()
}

describe('blog articles', () => {
  it('have unique, URL-safe slugs', () => {
    const slugs = articles.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('have valid ISO publication dates', () => {
    for (const article of articles) {
      expect(article.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(article.publishedOn))).toBe(false)
    }
  })

  it('keep search-friendly titles and descriptions', () => {
    for (const article of articles) {
      expect(article.title.length).toBeLessThanOrEqual(90)
      expect(article.description.length).toBeGreaterThan(80)
      expect(article.description.length).toBeLessThanOrEqual(220)
    }
  })

  it('cite only https sources', () => {
    for (const source of articles.flatMap((a) => a.sources)) {
      expect(source.url).toMatch(/^https:\/\//)
    }
  })

  it('never use banned wording or claims the product cannot back', () => {
    for (const article of articles) {
      const text = allText(article)
      for (const word of BANNED) expect(text, `${article.slug}: ${word}`).not.toContain(word)
    }
  })

  it('belong to at least one theme, and every theme with articles lists them', () => {
    for (const article of articles) expect(article.topics.length).toBeGreaterThan(0)
    for (const topic of TOPICS) {
      for (const article of articlesForTopic(topic)) expect(article.topics).toContain(topic)
    }
  })

  it('suggest related articles that share a theme first, never the article itself', () => {
    for (const article of articles) {
      const related = relatedArticles(article)
      expect(related.map((a) => a.slug)).not.toContain(article.slug)
      if (related.length > 1) {
        const shared = (a: Article) => a.topics.filter((t) => article.topics.includes(t)).length
        expect(shared(related[0])).toBeGreaterThanOrEqual(shared(related[related.length - 1]))
      }
    }
  })

  it('keep FAQ answers short enough to be quoted, and every rule article cites a source', () => {
    for (const article of articles) {
      for (const item of article.faq ?? []) {
        expect(item.question.endsWith('?')).toBe(true)
        expect(item.answer.length).toBeLessThanOrEqual(320)
      }
      if (article.topics.includes('reglementation')) expect(article.sources.length).toBeGreaterThan(0)
    }
  })

  it('finds an article by slug and returns undefined otherwise', () => {
    expect(getArticle(articles[0].slug)).toBe(articles[0])
    expect(getArticle('nope')).toBeUndefined()
  })

  it('sorts newest first', () => {
    const dates = sortedArticles().map((a) => a.publishedOn)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('estimates at least one minute of reading', () => {
    for (const article of articles) expect(readingMinutes(article)).toBeGreaterThanOrEqual(1)
  })

  it('gives structured data a full date-time with a time zone', () => {
    expect(toIsoDateTime('2026-10-12')).toBe('2026-10-12T09:00:00+00:00')
    expect(Number.isNaN(Date.parse(toIsoDateTime('2026-10-12')))).toBe(false)
  })

  it('formats dates in French regardless of the time zone', () => {
    expect(formatFrenchDate('2026-10-12')).toBe('12 octobre 2026')
    expect(formatFrenchDate('2026-01-01')).toBe('1 janvier 2026')
  })
})

describe('rss feed', () => {
  const channel = { title: 'Blog & co', description: 'Desc <b>', siteUrl: 'https://www.example.com' }

  it('escapes XML special characters', () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;')
  })

  it('lists every article with an absolute link', () => {
    const xml = buildRss(channel, sortedArticles())
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<title>Blog &amp; co</title>')
    expect(xml).toContain('<description>Desc &lt;b&gt;</description>')
    for (const article of articles) {
      expect(xml).toContain(`<link>https://www.example.com/blog/${article.slug}</link>`)
    }
    expect(xml.match(/<item>/g)).toHaveLength(articles.length)
  })

  it('stays valid with no article', () => {
    const xml = buildRss(channel, [])
    expect(xml).not.toContain('<item>')
    expect(xml).not.toContain('lastBuildDate')
  })
})
