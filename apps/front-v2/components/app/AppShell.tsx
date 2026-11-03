'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { Sidebar, type SidebarProps } from '@/components/app/Sidebar'
import { Topbar } from '@/components/app/Topbar'

/**
 * The signed-in chrome: sidebar (a drawer below md), topbar, the page in
 * <main>, toasts. `data-app-shell` lets the theme repaint the app area per
 * brand (Spar-x: dark teal); every colour below is a token.
 */
export function AppShell({ children, ...sidebar }: Omit<SidebarProps, 'mobileOpen' | 'onCloseMobile'> & { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const close = useCallback(() => setMobileOpen(false), [])

  // The drawer closes on navigation and on Escape.
  useEffect(() => { setMobileOpen(false) }, [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <div data-app-shell className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <Sidebar {...sidebar} mobileOpen={mobileOpen} onCloseMobile={close} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar mobileOpen={mobileOpen} onOpenMobile={() => setMobileOpen(true)} />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto bg-canvas focus:outline-none">
          {children}
        </main>
      </div>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: '!rounded-lg !border !border-line !bg-raised !text-ink !text-[13px]',
            description: '!text-quiet',
          },
        }}
      />
    </div>
  )
}
