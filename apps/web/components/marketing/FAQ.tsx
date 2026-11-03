// Server Component, no JavaScript: native <details>, so every answer is in
// the HTML (crawlers, answer engines, no-JS readers) and opens without a
// script. The Radix accordion it replaces unmounted closed answers.
import { brand } from '@/lib/brand'
import { faqs } from '@/lib/marketing/faq-content'

export function FAQ() {
  return (
    <section id="faq" className="border-b border-border py-24 md:py-32" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 md:px-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4">
          <h2 id="faq-title" className="font-display text-[clamp(2rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
            Questions fréquentes
          </h2>
          <p className="mt-4 text-muted">
            Une autre question ?{' '}
            <a href={`mailto:contact@${brand.domain}`} className="text-white underline decoration-muted underline-offset-4 transition-colors hover:decoration-cyan">
              Écrivez-nous
            </a>
            .
          </p>
        </div>

        <div className="border-t border-border lg:col-span-8">
          {faqs.map((faq) => (
            <details key={faq.question} className="faq-item group border-b border-border">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-white [&::-webkit-details-marker]:hidden">
                <span className="font-medium leading-snug">{faq.question}</span>
                <span className="relative mt-1.5 h-3 w-3 shrink-0" aria-hidden="true">
                  <span className="absolute left-0 top-1/2 h-px w-3 bg-muted" />
                  <span className="absolute left-1/2 top-0 h-3 w-px bg-muted transition-transform duration-200 ease-signal group-open:scale-y-0" />
                </span>
              </summary>
              <div className="faq-answer pb-6 pr-10 text-sm leading-relaxed text-muted">{faq.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
