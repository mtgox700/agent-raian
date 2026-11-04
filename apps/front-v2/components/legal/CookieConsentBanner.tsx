'use client'

/**
 * GDPR cookie consent banner, body n°1's behaviour in body n°2's primitives.
 *
 *  • First visit -> banner appears bottom-right after a 600ms delay
 *  • "Tout accepter" / "Refuser", same weight (closing = refusing)
 *  • The decision lives in lib/analytics/consent; PostHog loads only after an
 *    acceptance (see PostHogProvider)
 *  • The banner can be reopened at any time (footer "Gérer les cookies") so the
 *    visitor can withdraw consent as easily as they gave it
 *
 * No animation library: public pages ship none (DESIGN.md, Motion).
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui'
import { readConsent, writeConsent, onConsentDialogRequest } from '@/lib/analytics/consent'
import { consentCopy as t } from '@/lib/copy/consent'

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
    const timer = setTimeout(() => setVisible(true), 600)
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [])

  // Opened from the footer link: move focus into the banner so keyboard and
  // screen-reader users land on the choice they asked for.
  useEffect(() => {
    if (visible && reopened) firstActionRef.current?.focus()
  }, [visible, reopened])

  const accept = () => { writeConsent(true); setVisible(false) }
  const decline = () => { writeConsent(false); setVisible(false) }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] max-w-sm rounded-lg border border-line bg-raised p-5 text-ink sm:left-auto"
    >
      <button
        type="button"
        onClick={decline}
        aria-label={t.close}
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="pr-10">
        <p id="cookie-banner-title" className="font-mono text-xs uppercase tracking-[0.14em] text-quiet">
          {t.title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/85">
          {t.body}{' '}
          <Link href={t.privacyHref} className="text-ink underline decoration-line underline-offset-2 transition-colors duration-200 ease-signal hover:text-accent hover:decoration-accent">
            {t.learnMore}
          </Link>
          .
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <Button ref={firstActionRef} type="button" variant="outline" size="sm" onClick={decline} className="flex-1">
          {t.decline}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={accept} className="flex-1">
          {t.accept}
        </Button>
      </div>
    </div>
  )
}
