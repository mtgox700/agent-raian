'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogoNav } from '@/components/brand/BrandLogo'
import { navigation } from '@/lib/marketing/content'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const { links: navLinks, ariaLabel, menuAriaLabel, signIn, getStarted } = navigation.navbar

const PING_KEY = 'phantera:mark-ping'

/** The logo's point emits its ring once per browser session, not on every page. */
function useFirstVisitPing(): boolean {
  const [ping, setPing] = useState(false)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(PING_KEY)) return
      sessionStorage.setItem(PING_KEY, '1')
      setPing(true)
    } catch {
      // Storage blocked (private mode): the ring is decoration, skip it.
    }
  }, [])
  return ping
}

function isCurrent(pathname: string, href: string): boolean {
  return !href.startsWith('/#') && (pathname === href || pathname.startsWith(`${href}/`))
}

export function Navbar() {
  const pathname = usePathname()
  const ping = useFirstVisitPing()
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // A route change or the Escape key closes the mobile menu.
  useEffect(() => {
    menuRef.current?.removeAttribute('open')
  }, [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const menu = menuRef.current
      if (e.key !== 'Escape' || !menu?.open) return
      menu.removeAttribute('open')
      menu.querySelector('summary')?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const closeMenu = () => menuRef.current?.removeAttribute('open')

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b pt-[env(safe-area-inset-top)] transition-colors duration-300 ease-signal',
        scrolled ? 'border-border' : 'border-transparent',
      )}
    >
      {/* The glass lives on its own layer: a backdrop-filter on <header>
          would become the containing block of the fixed mobile sheet. It is
          always there, so text never runs under a clear bar before hydration. */}
      <div className="absolute inset-0 -z-10 bg-void/80 backdrop-blur-md" aria-hidden="true" />
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-8" aria-label={ariaLabel}>
        <Link href="/" aria-label={navigation.homeAriaLabel} className="-m-2 rounded-md p-2">
          <BrandLogoNav ping={ping} />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const current = isCurrent(pathname, link.href)
            return (
              <li key={link.href}>
                <a
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'relative rounded-md px-3 py-2 text-sm transition-colors duration-200',
                    current ? 'text-white' : 'text-muted hover:text-white',
                  )}
                >
                  {link.label}
                  {current && (
                    <span className="absolute inset-x-3 -bottom-px h-px bg-cyan" aria-hidden="true" />
                  )}
                </a>
              </li>
            )
          })}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/sign-in"
            className="rounded-md px-3 py-2 text-sm text-muted transition-colors duration-200 hover:text-white"
          >
            {signIn}
          </Link>
          <a
            href="/#pricing"
            className={buttonVariants({ size: 'sm' })}
          >
            {getStarted}
          </a>
        </div>

        {/* Mobile: a native disclosure, so the menu opens even before (or
            without) JavaScript. The sheet sits under the 64px bar. */}
        <details ref={menuRef} className="group md:hidden">
          <summary
            className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border text-white [&::-webkit-details-marker]:hidden"
            aria-label={menuAriaLabel}
          >
            <span className="relative block h-3 w-4" aria-hidden="true">
              <span className="absolute left-0 top-0 h-px w-4 bg-current transition-transform duration-200 ease-signal group-open:top-1.5 group-open:rotate-45" />
              <span className="absolute left-0 top-1.5 h-px w-4 bg-current transition-opacity duration-150 group-open:opacity-0" />
              <span className="absolute left-0 top-3 h-px w-3 bg-current transition-transform duration-200 ease-signal group-open:top-1.5 group-open:w-4 group-open:-rotate-45" />
            </span>
          </summary>

          <div className="fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] z-40 flex flex-col overflow-y-auto overscroll-contain border-t border-border bg-void px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <ul className="flex-1 py-2">
              {navLinks.map((link, i) => (
                <li key={link.href} className="border-b border-border">
                  <a
                    href={link.href}
                    onClick={closeMenu}
                    aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}
                    className="flex items-baseline gap-4 py-5 text-white"
                  >
                    <span className="w-6 font-mono text-xs text-muted tabular-nums" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
                      {link.label}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 pt-6">
              <a
                href="/#pricing"
                onClick={closeMenu}
                className={buttonVariants({ size: 'lg' })}
              >
                {getStarted}
              </a>
              <Link
                href="/sign-in"
                onClick={closeMenu}
                className="flex h-12 items-center justify-center rounded-md border border-border text-base text-white"
              >
                {signIn}
              </Link>
            </div>
          </div>
        </details>
      </nav>
    </header>
  )
}
