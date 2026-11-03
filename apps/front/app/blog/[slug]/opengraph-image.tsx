import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { articles, getArticle } from '@/lib/marketing/blog'
import { ArticleShareImage } from '@/lib/seo/article-share-image'

export const alt = 'Article du blog Phantera'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamicParams = false

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }))
}

export default async function ArticleOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug)
  if (!article) notFound()
  return new ImageResponse(<ArticleShareImage title={article.title} author={article.author.name} />, { ...size })
}
