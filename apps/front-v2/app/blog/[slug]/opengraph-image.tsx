import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { themeByKey } from '@phantera/themes'
import { brand } from '@/lib/brand'
import { articles, getArticle } from '@/lib/marketing/blog'

export const alt = `Article du blog ${brand.name}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamicParams = false

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }))
}

// Satori draws with literal colours (no CSS variables): they come from the active brand's theme.
export default async function ArticleOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug)
  if (!article) notFound()
  const { colors } = themeByKey(brand.key)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '72px 80px',
          background: colors.background, color: colors.text, fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 30, fontWeight: 700 }}>
          <div style={{ display: 'flex' }}>{brand.name}</div>
          <div style={{ display: 'flex', fontSize: 22, color: colors.primary, letterSpacing: 3 }}>BLOG</div>
        </div>
        <div style={{ display: 'flex', marginTop: 56, fontSize: 60, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1040 }}>
          {article.title}
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', justifyContent: 'space-between', fontSize: 24, color: colors.textMuted }}>
          <div style={{ display: 'flex' }}>{article.author.name}</div>
          <div style={{ display: 'flex' }}>{brand.tagline}</div>
        </div>
      </div>
    ),
    { ...size },
  )
}
