/** @type {import('next').NextConfig} */

// Content-Security-Policy is set per request by the middleware
// (lib/security/csp.ts): strict with a nonce on signed-in surfaces, static on
// prerendered public pages. The other headers apply to every response.
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
      // An SVG opened directly is a document that can run script on our
      // origin; files from public/ never reach the middleware, so they get
      // an inert policy here.
      {
        source: '/(.*)\\.svg',
        headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" }],
      },
    ]
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    // 1 year cache: images are content-addressed by Next.js, safe to cache long
    minimumCacheTTL: 31536000,
  },

  compress:        true,
  poweredByHeader: false,
  reactStrictMode: true,

  experimental: {
    // Inline critical above-the-fold CSS: reduces render-blocking resources
    optimizeCss: true,
    // Tree-shake heavy packages at compile time
    optimizePackageImports: [
      'framer-motion',
      'lucide-react',
      'recharts',
      '@tanstack/react-query',
      // @tanstack/react-table excluded: ESM barrel causes webpack parse error with next-flight-client-module-loader
      '@radix-ui/react-accordion',
      '@radix-ui/react-slot',
    ],
  },
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

  // Tunnel browser-side requests through /monitoring to bypass ad-blockers
  tunnelRoute: '/monitoring',

  // Note: `disableLogger` and `automaticVercelMonitors` are options moved under
  // `webpack` in Sentry 10.x but unsupported with Turbopack. Skipped — Next 16
  // tree-shaking + Vercel native monitoring cover both for our use case.
})
