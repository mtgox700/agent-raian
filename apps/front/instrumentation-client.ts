/**
 * Browser-side Sentry initialisation, loaded once the browser is idle.
 *
 * A static `import * as Sentry` put the SDK (with its tracing) in the first
 * chunk of EVERY page and ran it before hydration: on the mobile landing it
 * was the largest script and most of the main-thread time before the LCP
 * (Lighthouse, 2026-10-25). Loading it on idle keeps error capture for the
 * whole visit; the trade-off is that an error thrown in the first second or
 * two of a page load is not reported.
 */

type SentryModule = typeof import('@sentry/nextjs')

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
let sentry: SentryModule | null = null

function start() {
  void import('@sentry/nextjs').then((Sentry) => {
    sentry = Sentry
    Sentry.init({
      dsn,
      environment:      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
      release:          process.env.NEXT_PUBLIC_APP_VERSION,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // Session Replay intentionally OMITTED: replayIntegration bundles
      // ~50-90 KiB of replay/worker code. Error capture (the core value) stays.
      ignoreErrors: [
        'NEXT_REDIRECT',
        'NEXT_NOT_FOUND',
        'AbortError',
        'ResizeObserver loop limit exceeded',  // benign Chrome noise
        'Non-Error promise rejection captured', // hydration nullable warnings
      ],
    })
  })
}

if (dsn && typeof window !== 'undefined') {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: 4000 })
  else setTimeout(start, 2000)
}

// Required for App Router router-transition error capture; a no-op until the
// SDK has loaded.
export function onRouterTransitionStart(...args: Parameters<SentryModule['captureRouterTransitionStart']>) {
  sentry?.captureRouterTransitionStart(...args)
}
