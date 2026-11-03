import Link from 'next/link'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { buttonVariants, Container } from '@/components/ui'
import { navigation, isBuilt } from '@/lib/content'

// Server Component. The phone menu is a native <details>: it opens without JS.
export function Navbar() {
  const { navbar } = navigation
  const links = navbar.links.filter((l) => isBuilt(l.href))
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" aria-label={navigation.homeAriaLabel} className="-m-2 rounded-md p-2">
          <Logo />
        </Link>
        <nav aria-label={navbar.ariaLabel} className="hidden md:block">
          <ul className="flex items-center gap-8">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-sm text-quiet transition-colors duration-200 hover:text-ink">{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/sign-in" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>{navbar.signIn}</Link>
          <Link href="/sign-up" className={buttonVariants({ size: 'sm' })}>{navbar.getStarted}</Link>
        </div>
        <details className="group md:hidden">
          <summary aria-label={navbar.menuAriaLabel} className="-m-2 rounded-md p-2 text-ink">
            <Menu className="size-6" aria-hidden="true" />
          </summary>
          <nav aria-label={navbar.ariaLabel} className="absolute inset-x-0 top-16 border-b border-line bg-canvas px-5 pb-6">
            <ul>
              {links.map((l) => (
                <li key={l.href} className="border-b border-line">
                  <a href={l.href} className="block py-4 text-ink">{l.label}</a>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: 'lg' })}>{navbar.getStarted}</Link>
              <Link href="/sign-in" className={buttonVariants({ variant: 'outline', size: 'lg' })}>{navbar.signIn}</Link>
            </div>
          </nav>
        </details>
      </Container>
    </header>
  )
}
