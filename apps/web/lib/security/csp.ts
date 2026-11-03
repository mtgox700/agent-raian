/**
 * Content-Security-Policy, in two tiers.
 *
 * Strict (signed-in surfaces: dashboard, onboarding, invitation, sign-in/up).
 *   These pages are rendered per request, so each response gets a fresh nonce:
 *   only scripts carrying it run, plus what they load ('strict-dynamic').
 *   No 'unsafe-inline' scripts, no 'unsafe-eval' in production. Set by the
 *   middleware, which also passes the nonce to Next.js through the request
 *   headers (Next adds it to its own scripts).
 *
 * Static (marketing pages, blog, legal: prerendered HTML, no session data,
 *   no user input rendered). A nonce cannot exist in a page built once for
 *   everyone, and making them dynamic would cost the performance budget.
 *   They keep 'unsafe-inline' for Next's inline bootstrap scripts, without
 *   'unsafe-eval', and with the other directives as strict as the app.
 *   Both are set by the middleware.
 *
 * Both: no plugins, no <base> hijack, no framing, forms only to us/Clerk.
 * No upgrade-insecure-requests: HSTS already forces HTTPS on our domain and
 * every allowed source is HTTPS; the directive only broke local runs over
 * plain HTTP.
 */

const CLERK_HOSTS = [
  'https://clerk.phantera-tn.com',
  'https://accounts.phantera-tn.com',
  'https://*.clerk.accounts.dev',
]
const POSTHOG_ASSETS = 'https://eu-assets.i.posthog.com'
const POSTHOG_API = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com').replace(/\/$/, '')
const TURNSTILE = 'https://challenges.cloudflare.com'

function join(directives: Record<string, string[]>): string {
  return Object.entries(directives).map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : name)).join('; ')
}

const COMMON: Record<string, string[]> = {
  'default-src':     ["'self'"],
  'img-src':         ["'self'", 'blob:', 'data:', 'https:'],
  'font-src':        ["'self'", 'data:', ...CLERK_HOSTS],
  // Only the hosts the browser really talks to: our API (Sentry goes through
  // the /monitoring tunnel), Clerk, PostHog. A script that slipped in cannot
  // fetch() data out to any other host.
  'connect-src':     ["'self'", ...CLERK_HOSTS, 'https://clerk-telemetry.com', 'https://*.clerk-telemetry.com', POSTHOG_API, POSTHOG_ASSETS],
  // Images stay open to https: the signature logo and lead pictures are
  // URLs typed by customers.

  'frame-src':       ["'self'", ...CLERK_HOSTS, TURNSTILE, 'https://js.stripe.com', 'https://hooks.stripe.com'],
  'worker-src':      ["'self'", 'blob:'],
  'object-src':      ["'none'"],
  'base-uri':        ["'self'"],
  'form-action':     ["'self'", ...CLERK_HOSTS],
  'frame-ancestors': ["'none'"],
}

/** The policy of the signed-in surfaces, for one response. */
export function strictCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  return join({
    ...COMMON,
    // 'self' and the hosts are ignored by CSP3 browsers once 'strict-dynamic'
    // is present; they remain as the fallback of older browsers.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : []), ...CLERK_HOSTS, TURNSTILE, POSTHOG_ASSETS],
    // Clerk and the motion library set inline styles.
    'style-src':  ["'self'", "'unsafe-inline'", ...CLERK_HOSTS],
  })
}

/** The policy of the prerendered public pages. */
export function staticCsp(opts: { dev?: boolean } = {}): string {
  return join({
    ...COMMON,
    // A policy belongs to the document: a visitor who clicks "Se connecter"
    // on a public page reaches /sign-in by client-side navigation, under
    // this policy. Clerk and Turnstile must therefore load here too.
    'script-src': ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : []), ...CLERK_HOSTS, TURNSTILE, POSTHOG_ASSETS],
    'style-src':  ["'self'", "'unsafe-inline'"],
  })
}

/** A fresh random nonce (128 bits), base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/** The routes rendered per request that get the strict policy (middleware and next.config agree on this list). */
export const STRICT_CSP_PREFIXES = ['/dashboard', '/onboarding', '/invite', '/sign-in', '/sign-up'] as const

export function isStrictCspPath(pathname: string): boolean {
  // Decoded first: /%64ashboard must not slip under the static policy.
  let path = pathname
  try { path = decodeURIComponent(pathname) } catch { /* malformed: matched as is */ }
  return STRICT_CSP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}
