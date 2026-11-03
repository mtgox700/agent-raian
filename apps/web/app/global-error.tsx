'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Last-resort boundary: replaces the root layout, so it brings its own html/body
// and plain styles (the app's CSS may be what failed).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050508', color: '#F4F4F6', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Une erreur inattendue est survenue</h1>
          <p style={{ color: '#8E94A6', fontSize: 14, margin: '0 0 24px' }}>
            Notre équipe a été prévenue. Vous pouvez réessayer.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ background: '#00D4FF', color: '#050508', border: 0, borderRadius: 6, padding: '12px 20px', fontWeight: 600, cursor: 'pointer' }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
