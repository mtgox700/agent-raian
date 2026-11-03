/**
 * Next.js instrumentation hook: server & edge runtime entrypoint.
 *
 * Auto-loaded by Next on cold start; we use it to initialise Sentry on
 * the matching runtime. Client-side init happens in `instrumentation-client.ts`.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
import * as Sentry from '@sentry/nextjs'

export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return // No-op in dev / CI when DSN is absent

  const common = {
    dsn,
    environment:       process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release:           process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate:  process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Filter out noise: these are user-controlled / expected errors
    ignoreErrors: [
      'NEXT_REDIRECT',          // expected control-flow from redirect()
      'NEXT_NOT_FOUND',         // expected control-flow from notFound()
      'AbortError',             // client aborted request
      'rate limit',             // our 429s — logged, not error-worthy
    ] as string[],
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      ...common,
      // Capture Prisma + Stripe + Resend network calls in traces
      integrations: [],
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(common)
  }
}

// Required for App Router request error capture in Next.js 15+
export const onRequestError = Sentry.captureRequestError
