import { Section } from '@/components/ui'
import { contactHref, faq } from '@/lib/content'

/** Native <details>: answers open without JavaScript. Also FAQPage structured data. */
export function Faq() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.questions.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
  }
  return (
    <Section
      id="faq"
      index={4}
      title={faq.title}
      intro={<>{faq.intro.before}{' '}<a href={contactHref} className="text-ink underline decoration-line underline-offset-4 hover:decoration-accent">{faq.intro.linkLabel}</a>{faq.intro.after}</>}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
      <div className="mt-12 border-t border-line">
        {faq.questions.map((q) => (
          <details key={q.question} className="group border-b border-line">
            <summary className="flex items-start justify-between gap-6 py-6 font-display text-lg font-semibold tracking-[-0.015em] text-ink">
              {q.question}
              <span className="relative mt-2 size-3 shrink-0" aria-hidden="true">
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-accent" />
                <span className="faq-plus-v absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-accent transition-transform duration-200" />
              </span>
            </summary>
            <p className="max-w-prose pb-6 leading-relaxed text-quiet">{q.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}
