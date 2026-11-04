import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { Container, Heading } from '@/components/ui'
import { StructuredData } from '@/components/marketing/blog/StructuredData'
import { ArticleList, TopicNav, blogSchema } from '@/components/marketing/blog/ArticleList'
import { Breadcrumb } from '@/components/marketing/blog/Breadcrumb'
import { brand } from '@/lib/brand'
import { TOPICS, TOPIC_DESCRIPTIONS, TOPIC_LABELS, articlesForTopic, isTopic } from '@/lib/marketing/blog'

export const dynamicParams = false

/** Only themes that have at least one article get a page. */
export function generateStaticParams() {
  return TOPICS.filter((topic) => articlesForTopic(topic).length > 0).map((topic) => ({ topic }))
}

interface PageProps {
  params: Promise<{ topic: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic } = await params
  if (!isTopic(topic)) return {}
  const url = `${brand.url}/blog/theme/${topic}`
  const title = `${TOPIC_LABELS[topic]} : articles sur la prospection B2B`
  return {
    title,
    description: TOPIC_DESCRIPTIONS[topic],
    alternates: { canonical: url },
    openGraph: { type: 'website', url, title, description: TOPIC_DESCRIPTIONS[topic], siteName: brand.name },
  }
}

export default async function TopicPage({ params }: PageProps) {
  const { topic } = await params
  if (!isTopic(topic)) notFound()
  const list = articlesForTopic(topic)
  if (list.length === 0) notFound()
  const url = `${brand.url}/blog/theme/${topic}`

  return (
    <>
      <StructuredData
        schema={[
          blogSchema(list, url, `${TOPIC_LABELS[topic]}, le blog ${brand.name}`),
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: brand.name, item: brand.url },
              { '@type': 'ListItem', position: 2, name: 'Blog', item: `${brand.url}/blog` },
              { '@type': 'ListItem', position: 3, name: TOPIC_LABELS[topic], item: url },
            ],
          },
        ]}
      />
      <Navbar />
      <main id="main-content">
        <Container className="pb-24 pt-16 md:pt-24">
          <Breadcrumb section={{ href: '/blog', label: 'Blog' }} />
          <Heading as="h1" size="hero" className="mt-6 max-w-[16ch]">{TOPIC_LABELS[topic]}</Heading>
          <p className="mt-8 max-w-prose text-lg leading-relaxed text-quiet">{TOPIC_DESCRIPTIONS[topic]}</p>
          <TopicNav current={topic} />
          <ArticleList list={list} />
        </Container>
      </main>
      <Footer />
    </>
  )
}
