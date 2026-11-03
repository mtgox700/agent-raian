import type { Metadata } from 'next'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { StructuredData } from '@/components/seo/StructuredData'
import { ArticleList, TopicNav, blogSchema } from '@/components/marketing/blog/ArticleList'
import { brand } from '@/lib/brand'
import { PageHeader } from '@/components/marketing/PageHeader'
import { sortedArticles } from '@/lib/marketing/blog'

const TITLE = 'Blog : prospection B2B, délivrabilité et règles par canal'
const DESCRIPTION = `Ce que nous apprenons en construisant ${brand.name} : délivrabilité des e-mails, règles de la prospection B2B par e-mail, SMS et WhatsApp, séquences multicanales, et nos erreurs.`

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${brand.url}/blog`,
    types: { 'application/rss+xml': `${brand.url}/blog/rss.xml` },
  },
  openGraph: { type: 'website', url: `${brand.url}/blog`, title: TITLE, description: DESCRIPTION, siteName: brand.name },
}

export default function BlogIndexPage() {
  const list = sortedArticles()
  return (
    <>
      <StructuredData schema={blogSchema(list, `${brand.url}/blog`, `Le blog ${brand.name}`)} />
      <Navbar />
      <main id="main-content">
        <PageHeader
          eyebrow={brand.tagline}
          title="Le blog"
          lead={`Ce que nous apprenons en construisant ${brand.name}, chiffres et erreurs compris. Pour les fondateurs de cabinets, d'ESN et d'agences B2B qui prospectent eux-mêmes.`}
        />
        <div className="mx-auto max-w-[1200px] px-5 pb-24 md:px-8">
          <TopicNav />
          <ArticleList list={list} />
          <p className="mt-10 font-mono text-xs text-muted">
            <a href="/blog/rss.xml" className="underline decoration-muted underline-offset-4 transition-colors hover:text-white hover:decoration-cyan">Flux RSS</a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
