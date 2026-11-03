// Server Component, no JavaScript: four verifiable product facts on one
// hairline grid. Reality Lock (C1): each value is a checkable feature of the
// product, never a volume, a rating or a customer count.

const facts = [
  { value: '0 à 100',  label: 'Une note par lead, selon sa proximité avec votre client idéal' },
  { value: 'Vos boîtes', label: 'Connectez Gmail, Outlook ou votre SMTP : vos emails partent de votre adresse' },
  { value: 'Arrêt net', label: 'La séquence s’arrête dès que le prospect répond' },
  { value: '0 €', label: 'La formule gratuite, sans carte bancaire ni limite de durée' },
]

export function StatsBar() {
  return (
    <section className="border-b border-border" aria-label="Ce que fait le produit">
      <dl className="mx-auto grid max-w-[1200px] grid-cols-2 px-5 md:px-8 lg:grid-cols-4">
        {facts.map((fact, i) => (
          <div
            key={fact.value}
            className={[
              'flex flex-col gap-2 py-8 pr-4',
              i % 2 === 1 ? 'border-l border-border pl-4' : 'pl-0',
              i >= 2 ? 'border-t border-border lg:border-t-0' : '',
              i >= 1 ? 'lg:border-l lg:border-border lg:pl-6' : 'lg:pl-0',
            ].join(' ')}
          >
            <dt className="order-2 text-sm leading-snug text-muted">{fact.label}</dt>
            <dd className="order-1 font-display text-2xl font-semibold tracking-[-0.03em] text-white md:text-[1.75rem]">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
