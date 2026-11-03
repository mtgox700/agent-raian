import Link from 'next/link'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'
import { BrandLogoNav } from '@/components/brand/BrandLogo'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  maxWidth?: string
  showLogo?: boolean
}

// The card of the custom auth screens (onboarding, sign-up). It carries the
// real « Arrêt net » logo: the hexagon it used to draw belonged to the old
// identity. Hairline card, no glow, no corner brackets.
export function AuthCard({
  title,
  subtitle,
  children,
  maxWidth = 'max-w-md',
  showLogo = true,
}: AuthCardProps) {
  return (
    <div className={cn('w-full', maxWidth)}>
      <div className="relative rounded-[10px] border border-border bg-obsidian p-8">
        {showLogo && (
          <div className="mb-8">
            <Link href="/" aria-label={`${brand.name}, accueil`} className="-m-2 inline-block rounded-md p-2">
              <BrandLogoNav />
            </Link>
          </div>
        )}

        <div className="mb-6">
          <h1 className="font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.03em] text-white">
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>

        {children}
      </div>
    </div>
  )
}
