import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { Container } from '@/components/ui'
import { CookieSettingsLink } from '@/components/legal/CookieSettingsLink'
import { identity, isBuilt, navigation, resolveHref } from '@/lib/content'

const linkClass = 'text-ink/80 transition-colors hover:text-accent'

/**
 * Footer columns from content, keeping only links whose page exists in body n°2.
 * The column flagged `withCookieSettings` also reopens the cookie banner (as in body n°1).
 */
export function Footer() {
  const columns = navigation.footer.columns
    .map((c) => ({ ...c, links: c.links.filter((l) => isBuilt(resolveHref(l.href))) }))
    .filter((c) => c.links.length > 0 || c.withCookieSettings)
  return (
    <footer className="border-t border-line py-14">
      <Container className="grid gap-10 md:grid-cols-12">
        <div className="md:col-span-5">
          <Link href="/" aria-label={navigation.homeAriaLabel} className="-m-2 inline-block rounded-md p-2"><Logo /></Link>
          <p className="mt-4 max-w-[30ch] text-sm leading-relaxed text-quiet">{identity.tagline}</p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title} className="md:col-span-2">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-quiet">{c.title}</p>
            <ul className="mt-4 grid gap-3 text-sm">
              {c.links.map((l) => (
                <li key={l.label}><a href={resolveHref(l.href)} className={linkClass}>{l.label}</a></li>
              ))}
              {c.withCookieSettings && <li><CookieSettingsLink className={linkClass} /></li>}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="mt-12">
        <p className="font-mono text-xs text-quiet">&copy; {new Date().getFullYear()} {identity.name}. {navigation.footer.rightsReserved}</p>
      </Container>
    </footer>
  )
}
