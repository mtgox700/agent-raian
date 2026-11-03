/** @type {import('next').NextConfig} */

// The chassis serves JSON (and a few redirects) only: no pages. Its fronts
// live in apps/front and reach it through /api/* (rewrite to API_URL).
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',  value: 'on' },
  {
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // DENY: no legitimate reason to iframe Phantera pages (frame-ancestors too)
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  // The legacy XSS auditor is off in modern browsers and could itself be
  // abused; '0' is the current recommendation (OWASP), CSP protects instead.
  { key: 'X-XSS-Protection',        value: '0' },
  // strict-origin-when-cross-origin: sends only origin to external sites
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  // Our windows do not share a browsing context with other sites; popups
  // opened by us (Stripe, OAuth) keep working.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  {
    key:   'Permissions-Policy',
    value: [
      'camera=()', 'microphone=()', 'geolocation=()', 'browsing-topics=()', 'interest-cohort=()',
      'payment=()', 'usb=()', 'serial=()', 'bluetooth=()', 'hid=()', 'midi=()',
      'accelerometer=()', 'gyroscope=()', 'magnetometer=()', 'display-capture=()',
      'fullscreen=(self)',
    ].join(', '),
  },
]

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },

  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@phantera/contract', '@phantera/themes', '@phantera/content'],

  compress:        true,
  poweredByHeader: false,
  reactStrictMode: true,
}

// ── Sentry wrapper ───────────────────────────────────────────────────────────
// withSentryConfig instruments the build for error tracking + (optionally)
// source-map upload. Source-map upload requires SENTRY_AUTH_TOKEN + org/project
// slugs: we leave those empty for V0 so the build never fails on missing
// auth. To enable in CI later, set SENTRY_AUTH_TOKEN in Vercel env vars.
const { withSentryConfig } = require('@sentry/nextjs')

module.exports = withSentryConfig(nextConfig, {
  // Suppress Sentry CLI logs unless explicitly enabled
  silent: !process.env.CI,

  // Source maps: upload only when an auth token is present (skip in dev)
  org:         process.env.SENTRY_ORG,
  project:     process.env.SENTRY_PROJECT,
  authToken:   process.env.SENTRY_AUTH_TOKEN,

  // Don't fail the build if Sentry CLI cannot upload source maps
  errorHandler: (err) => {
    // eslint-disable-next-line no-console
    console.warn('[Sentry] Source map upload skipped:', err.message)
  },

  // Hide source maps from browser network tab in production
  hideSourceMaps: true,

  // Note: `disableLogger` and `automaticVercelMonitors` are options moved under
  // `webpack` in Sentry 10.x but unsupported with Turbopack. Skipped — Next 16
  // tree-shaking + Vercel native monitoring cover both for our use case.
})
