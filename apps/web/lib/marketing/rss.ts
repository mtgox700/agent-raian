import type { Article } from './blog'

interface FeedChannel {
  title: string
  description: string
  siteUrl: string
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char])
}

function rfc822(isoDate: string): string {
  return new Date(`${isoDate}T08:00:00Z`).toUTCString()
}

function item(article: Article, siteUrl: string): string {
  const url = `${siteUrl}/blog/${article.slug}`
  return [
    '<item>',
    `<title>${escapeXml(article.title)}</title>`,
    `<link>${escapeXml(url)}</link>`,
    `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `<description>${escapeXml(article.description)}</description>`,
    `<pubDate>${rfc822(article.publishedOn)}</pubDate>`,
    `<dc:creator>${escapeXml(article.author.name)}</dc:creator>`,
    '</item>',
  ].join('')
}

/** RSS 2.0 feed of the blog, newest article first (callers pass them sorted). */
export function buildRss(channel: FeedChannel, articles: Article[]): string {
  const blogUrl = `${channel.siteUrl}/blog`
  const lastBuild = articles[0] ? `<lastBuildDate>${rfc822(articles[0].publishedOn)}</lastBuildDate>` : ''
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(blogUrl)}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    '<language>fr-FR</language>',
    `<atom:link href="${escapeXml(`${blogUrl}/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
    lastBuild,
    ...articles.map((article) => item(article, channel.siteUrl)),
    '</channel>',
    '</rss>',
  ].join('\n')
}
