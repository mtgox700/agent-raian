'use client'

import { requestConsentDialog } from '@/lib/analytics/consent'

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={requestConsentDialog} className={className}>
      Gérer les cookies
    </button>
  )
}
