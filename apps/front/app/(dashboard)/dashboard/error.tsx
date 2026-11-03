'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { buttonVariants } from '@/components/ui/button-variants'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col justify-center px-2 py-16">
      <p className="font-mono text-xs text-gold">Erreur de chargement</p>
      <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-white">
        Cette page n&apos;a pas pu se charger.
      </h1>
      <p className="mt-3 max-w-md leading-relaxed text-muted">
        L&apos;erreur a été signalée à notre équipe. Vos campagnes continuent de tourner normalement.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-muted">Référence : {error.digest}</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={reset} className={buttonVariants()}>
          Réessayer
        </button>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  )
}
