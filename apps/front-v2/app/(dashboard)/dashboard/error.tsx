'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { Button, buttonVariants } from '@/components/ui'
import { errorCopy as t } from '@/lib/app-copy'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col justify-center px-4 py-16 md:px-6">
      <p className="font-mono text-xs text-signal">{t.eyebrow}</p>
      <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink">{t.title}</h1>
      <p className="mt-3 max-w-md leading-relaxed text-quiet">{t.body}</p>
      {error.digest && <p className="mt-3 font-mono text-xs text-quiet">{t.reference}{error.digest}</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={reset}>{t.retry}</Button>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>{t.back}</Link>
      </div>
    </div>
  )
}
