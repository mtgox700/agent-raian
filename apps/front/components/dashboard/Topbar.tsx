'use client'

import { useState, useEffect } from 'react'
import { UserButton } from '@clerk/nextjs'
import { Menu } from 'lucide-react'
import { NotificationBell } from '@/components/dashboard/NotificationBell'
import { useMobileNav } from '@/lib/stores/mobile-nav'

interface TopbarProps {
  title?: string
}

export function Topbar({ title }: TopbarProps) {
  const openMobile = useMobileNav((s) => s.open_)

  // Mount-check guard for Clerk's <UserButton>. Clerk renders the avatar
  // client-side only (it needs the session), so the SSR output and the
  // client-hydrated DOM differ -> React emits a hydration mismatch warning.
  // Rendering only after mount eliminates the noise without changing UX.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-void px-4 md:px-6">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger: opens the Sidebar drawer */}
        <button
          onClick={openMobile}
          aria-label="Ouvrir le menu"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-white/80 transition-colors duration-150 ease-signal hover:text-white md:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        {title && (
          <h1 className="truncate font-display text-base font-semibold tracking-[-0.02em] text-white">
            {title}
          </h1>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <NotificationBell />

        {mounted ? (
          <UserButton
            // `afterSignOutUrl` is the v5+ Clerk prop name (replaces the
            // deprecated alias). Sign-out lands on the landing page.
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox:         'h-8 w-8 rounded-full border border-border',
                userButtonTrigger: 'focus:shadow-none',
              },
            }}
          />
        ) : (
          // Placeholder matching the avatar size so the layout doesn't jump
          // when Clerk mounts after first paint.
          <div className="h-8 w-8 rounded-full border border-border bg-surface" aria-hidden />
        )}
      </div>
    </header>
  )
}
