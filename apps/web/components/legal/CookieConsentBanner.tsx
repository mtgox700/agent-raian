'use client'

/**
 * GDPR cookie consent banner.
 *
 *  • First visit -> banner appears bottom-right after a 600ms delay
 *  • "Tout accepter" / "Refuser" (closing = refusing)
 *  • The decision lives in lib/analytics/consent; PostHog loads only after an
 *    acceptance (see PostHogProvider)
 *  • The banner can be reopened at any time (footer "Gérer les cookies") so the
 *    visitor can withdraw consent as easily as they gave it
 */

import { useEffect, useRef, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { X } from 'lucide-react'
import { readConsent, writeConsent, onConsentDialogRequest } from '@/lib/analytics/consent'

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [reopened, setReopened] = useState(false)
  const firstActionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const off = onConsentDialogRequest(() => {
      setReopened(true)
      setVisible(true)
    })
    if (readConsent()) return off
    const t = setTimeout(() => setVisible(true), 600)
    return () => {
      clearTimeout(t)
      off()
    }
  }, [])

  // Opened from the footer link: move focus into the banner so keyboard and
  // screen-reader users land on the choice they asked for.
  useEffect(() => {
    if (visible && reopened) firstActionRef.current?.focus()
  }, [visible, reopened])

  const accept  = () => { writeConsent(true);  setVisible(false) }
  const decline = () => { writeConsent(false); setVisible(false) }

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-banner-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 left-4 sm:left-auto z-[60] max-w-sm rounded-[10px] border border-border bg-obsidian p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
        >
          <button
            onClick={decline}
            aria-label="Fermer la bannière (équivalent refuser)"
            className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="pr-10">
            <div className="min-w-0">
              <p id="cookie-banner-title" className="text-sm font-medium text-white">
                Cookies et confidentialité
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Phantera utilise des cookies essentiels pour le fonctionnement et,
                avec votre accord, des cookies de mesure d'audience anonymisée.{' '}
                <Link href="/legal/privacy" className="text-white underline decoration-border underline-offset-2 hover:decoration-cyan">
                  En savoir plus
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              ref={firstActionRef}
              onClick={decline}
              className="h-10 flex-1 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-white transition-colors hover:border-white/30"
            >
              Refuser
            </button>
            <button
              onClick={accept}
              className="h-10 flex-1 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-white transition-colors hover:border-white/30"
            >
              Tout accepter
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
