// Server Component. What the product does, said plainly, beside one real
// alert of the product (scene 3). Reality Lock (C1): only what ships.
import { landing } from '@/lib/marketing/content'
import { AnalystAlert } from './scenes/AnalystAlert'
import { ProductShots } from './ProductShots'

// Real captures of the dashboard, taken in the test environment on the
// fictional demo workspace (labelled as such under the stack). Spar-x has its
// own palette: these Phantera screens are not shown there (productShots: null).
const { title, items: features, productShots } = landing.features

export function Features() {
  return (
    <section id="features" className="border-b border-border py-24 md:py-32" aria-labelledby="features-title">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <h2 id="features-title" className="max-w-[44rem] font-display text-[clamp(2rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
          {title}
        </h2>

        <div className="mt-14 grid gap-14 lg:grid-cols-12 lg:gap-10">
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:col-span-7">
            {features.map((feature) => (
              <li key={feature.title} className="border-t border-border py-6">
                <h3 className="font-medium text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.text}</p>
              </li>
            ))}
          </ul>
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <AnalystAlert />
            </div>
          </div>
        </div>

        {productShots && <ProductShots shots={productShots} className="mt-20 md:mt-28" />}
      </div>
    </section>
  )
}
