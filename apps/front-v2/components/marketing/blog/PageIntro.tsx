import { Container, Eyebrow, Heading } from '@/components/ui'

/** Header of a blog or comparison index: eyebrow, h1, lead. */
export function PageIntro({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <Container className="pb-4 pt-20 md:pt-28">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading as="h1" size="hero" className="mt-6 max-w-[16ch]">{title}</Heading>
      {lead && <p className="mt-8 max-w-prose text-lg leading-relaxed text-quiet">{lead}</p>}
    </Container>
  )
}
