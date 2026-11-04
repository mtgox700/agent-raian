'use client'

import { requestConsentDialog } from '@/lib/analytics/consent'
import { consentCopy } from '@/lib/copy/consent'

/** Reopens the cookie banner, so consent is withdrawn as easily as it was given (body n°1's footer link). */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={requestConsentDialog} className={className}>
      {consentCopy.manage}
    </button>
  )
}
