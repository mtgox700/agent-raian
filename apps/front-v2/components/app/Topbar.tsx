'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { NotificationBell } from '@/components/app/NotificationBell'
import { shell } from '@/lib/app-copy'

export function Topbar({ mobileOpen, onOpenMobile }: { mobileOpen: boolean; onOpenMobile: () => void }) {
  // Clerk renders the avatar client side only (it needs the session): mounted
  // after hydration, with a placeholder of the same size so nothing jumps.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-canvas px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label={shell.openMenu}
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-line text-ink/80 transition-colors duration-200 ease-signal hover:text-ink md:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
        <Link href="/dashboard" className="-m-1 rounded-md p-1 md:hidden"><Logo surface="app" className="h-6" /></Link>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <NotificationBell />
        {mounted ? (
          <UserButton
            afterSignOutUrl="/"
            appearance={{ elements: { avatarBox: 'h-8 w-8 rounded-full border border-line', userButtonTrigger: 'focus:shadow-none' } }}
          />
        ) : (
          <div className="h-8 w-8 rounded-full border border-line bg-surface" aria-hidden="true" />
        )}
      </div>
    </header>
  )
}
