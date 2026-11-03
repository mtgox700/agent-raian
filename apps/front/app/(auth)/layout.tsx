import { AnimatedAuthBackground } from '@/components/auth/AnimatedAuthBackground'
import { AuthProviders } from '@/components/providers/AuthProviders'
import { brand } from '@/lib/brand'
import { BrandLogoNav } from '@/components/brand/BrandLogo'
import { BrandHeadline, BRAND_EYEBROW } from '@/components/marketing/BrandHeadline'

// Product facts only (Reality Lock: no invented numbers or customers).
const facts = [
  'Les relances s’arrêtent dès qu’un prospect répond',
  'E-mails vérifiés avant tout envoi',
  'Séquences rédigées pour votre cible, en français ou en anglais',
]

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProviders>
      <div className="relative min-h-[100dvh] w-full bg-void">
        <AnimatedAuthBackground />

        <div className="relative z-10 flex min-h-[100dvh] w-full">
          {/* Left panel: what the visitor is signing in to (hidden on mobile) */}
          <div className="hidden lg:flex lg:w-[45%] lg:flex-col lg:justify-between lg:px-14 lg:py-10">
            <a href="/" aria-label={`${brand.name}, accueil`} className="-m-2 w-fit rounded-md p-2">
              <BrandLogoNav />
            </a>

            <div className="mb-10 mt-auto">
              <p className="font-mono text-sm text-muted">{BRAND_EYEBROW}</p>
              <p className="mt-6 font-display text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] text-white">
                <BrandHeadline />
              </p>
              <p className="mt-6 max-w-[28rem] leading-relaxed text-muted">
                Trouvez, notez et contactez vos clients B2B idéaux, par e-mail et sur LinkedIn.
              </p>

              <ul className="mt-10 max-w-[28rem] border-t border-border">
                {facts.map((fact) => (
                  <li key={fact} className="flex items-center gap-3 border-b border-border py-3.5 text-sm text-white/85">
                    <span className="h-px w-3 shrink-0 bg-cyan" aria-hidden="true" />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>

            <p className="font-mono text-xs text-muted">
              &copy; {new Date().getFullYear()} {brand.name}. Tous droits réservés.
            </p>
          </div>

          {/* Right panel: the form (Clerk's card carries the logo on a phone). */}
          <div className="flex w-full flex-col items-center justify-center px-4 py-10 lg:w-[55%] lg:px-16">
            {children}
          </div>
        </div>
      </div>
    </AuthProviders>
  )
}
