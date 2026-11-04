import { brand } from '@/lib/brand'
import { sortedArticles } from '@/lib/marketing/blog'
import { buildRss } from '@/lib/marketing/rss'

export const dynamic = 'force-static'

export function GET() {
  const xml = buildRss(
    {
      title: `Blog ${brand.name}`,
      description: 'Prospection B2B, délivrabilité et coulisses d\'un SaaS construit en public.',
      siteUrl: brand.url,
    },
    sortedArticles(),
  )
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
