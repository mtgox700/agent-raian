import Link from 'next/link'
import { AuthProviders } from '@/components/providers/AuthProviders'
import { Logo } from '@/components/brand/Logo'
import { Eyebrow, StopShort } from '@/components/ui'
import { auth, identity, landing, navigation } from '@/lib/content'

/**
 * Sign-in and sign-up: the promise on one side, Clerk's form on the other.
 * The same sequence line as the landing, drawn once: you are at the point.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { hero } = landing
  return (
    <AuthProviders>
      <div className="flex min-h-dvh w-full">
        <aside className="hidden border-r border-line bg-raised lg:flex lg:w-[45%] lg:flex-col lg:justify-between lg:px-14 lg:py-10">
          <Link href="/" aria-label={navigation.homeAriaLabel} className="-m-2 w-fit rounded-md p-2"><Logo /></Link>
          <div>
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <p className="mt-6 text-balance font-display text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
              {hero.headline.first}
              <br />
              <span className="text-accent">{hero.headline.highlight}</span>
            </p>
            <StopShort animate className="mt-10 max-w-[24rem]" />
            <p className="mt-10 max-w-[28rem] leading-relaxed text-quiet">{auth.lead}</p>
            <ul className="mt-8 max-w-[28rem] border-t border-line">
              {auth.facts.map((fact) => (
                <li key={fact} className="flex items-center gap-3 border-b border-line py-3.5 text-sm text-ink/85">
                  <span className="h-px w-3 shrink-0 bg-accent" aria-hidden="true" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <p className="font-mono text-xs text-quiet">&copy; {new Date().getFullYear()} {identity.name}. {navigation.footer.rightsReserved}</p>
        </aside>
        <main id="main-content" className="flex w-full flex-col items-center justify-center gap-8 px-4 py-10 lg:w-[55%] lg:px-16">
          <Link href="/" aria-label={navigation.homeAriaLabel} className="-m-2 rounded-md p-2 lg:hidden"><Logo /></Link>
          {children}
        </main>
      </div>
    </AuthProviders>
  )
}
