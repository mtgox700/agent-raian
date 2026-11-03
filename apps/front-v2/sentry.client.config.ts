import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Session Replay removed — see instrumentation-client.ts for rationale.
    // replayIntegration statically bundles ~50-90 KiB into the client chunk
    // on every page; error capture is kept, only on-error replay is dropped.
  })
}
