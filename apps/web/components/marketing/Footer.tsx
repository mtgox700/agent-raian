import { BrandLogoNav } from '@/components/brand/BrandLogo'
import { brand } from '@/lib/brand'
import { CookieSettingsLink } from '@/components/legal/CookieSettingsLink'
import { navigation, resolveHref } from '@/lib/marketing/content'

// Reality Lock (C1): only links that actually resolve. Social links come
// back when the real company pages exist (a link to "#" is a dead end).
const { columns, rightsReserved } = navigation.footer

const linkClass = 'text-sm text-muted transition-colors duration-200 hover:text-white'

export function Footer() {
  return (
    <footer className="border-t border-border bg-void pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <div className="grid gap-12 py-16 md:grid-cols-12 md:gap-8 md:py-20">
          <div className="md:col-span-5">
            <a href="/" aria-label={navigation.homeAriaLabel} className="-m-2 inline-block rounded-md p-2">
              <BrandLogoNav />
            </a>
            <p className="mt-6 max-w-[22rem] font-display text-xl font-semibold leading-snug tracking-[-0.02em] text-white">
              {brand.tagline}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
            {columns.map(({ title, links, withCookieSettings }) => (
              <div key={title}>
                <h2 className="font-mono text-xs text-muted">{title}</h2>
                <ul className="mt-4 space-y-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a href={resolveHref(link.href)} className={linkClass}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                  {withCookieSettings && (
                    <li>
                      <CookieSettingsLink className={linkClass} />
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {brand.name}. {rightsReserved}</p>
          <p className="font-mono">{brand.domain}</p>
        </div>
      </div>
    </footer>
  )
}
