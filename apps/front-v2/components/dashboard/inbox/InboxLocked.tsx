import Link from 'next/link'
import { Check, Lock } from 'lucide-react'
import { buttonVariants } from '@/components/ui'
import { lockedCopy as t } from '@/lib/copy/inbox'

/** FREE / PRO: what the inbox does and the upgrade. Price and annual discount come from the view. */
export function InboxLocked({ price, annualDiscount }: { price: number; annualDiscount: number }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-raised">
        <Lock className="h-5 w-5 text-signal" aria-hidden="true" />
      </div>
      <p className="mb-2 font-mono text-xs text-quiet">{t.plan}</p>
      <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">{t.title}</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-quiet">{t.body}</p>
      <ul className="mt-6 grid max-w-md grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {t.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-xs text-quiet">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <Link href={t.upgradeHref} className={buttonVariants({ className: 'mt-8' })}>
        {t.upgrade}<span className="font-mono tabular-nums">{price} €</span>{t.perMonth}
      </Link>
      <p className="mt-3 font-mono text-xs tabular-nums text-quiet">{t.annual(annualDiscount)}{t.noCommitment}</p>
    </div>
  )
}
