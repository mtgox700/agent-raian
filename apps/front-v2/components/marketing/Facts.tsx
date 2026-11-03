import { Container } from '@/components/ui'
import { landing } from '@/lib/content'

/** What the product does, as facts (Reality Lock: product facts, no results). */
export function Facts() {
  const { stats } = landing
  return (
    <section aria-label={stats.ariaLabel} className="border-t border-line">
      <Container>
        <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {stats.facts.map((f) => (
            <div key={f.value} className="bg-canvas py-8 sm:px-6">
              <dt className="sr-only">{f.label}</dt>
              <dd className="flex flex-col gap-2">
                <span className="font-display text-3xl font-semibold tracking-[-0.03em] text-ink">{f.value}</span>
                <span className="text-sm leading-snug text-quiet">{f.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  )
}
