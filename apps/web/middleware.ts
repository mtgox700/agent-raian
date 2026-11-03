import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { isStrictCspPath, newNonce, staticCsp, strictCsp } from '@/lib/security/csp'
import { isServerAction, returnPath, signedOutResponse } from '@/lib/security/signed-out'

// ─── Route Matchers ───────────────────────────────────────────────────────────

/** Routes accessible without authentication */
const isPublicRoute = createRouteMatcher([
  '/',
  '/about(.*)',
  '/alternative',
  '/alternative/(.*)',
  '/legal(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/track(.*)',       // tracking pixel — called by email clients (no session cookie)
  '/api/health',          // liveness probe (uptime / CI)
  '/api/cron(.*)',        // Vercel cron: no session, guarded by CRON_SECRET in each route
  '/api/inngest(.*)',     // Inngest serve endpoint (signed requests, verified by SDK)
  '/api/security/redteam(.*)', // garak red-team probe — gated by ENABLE_REDTEAM + secret
  '/api/mcp(.*)',
  '/api/views/invite/(.*)', // invitation page data: the token is the key (signed-out visitors too)
  '/api/invitations/(.*)', // invitation start / resume / accept: token-guarded, redirect to sign-in themselves
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
  '/monitoring(.*)',     // Sentry tunnel: browser errors from signed-out visitors too
])

/**
 * Routes that need a session. Everything else is public: an unknown URL now
 * gets the 404 page, and the generated share images (/opengraph-image,
 * /twitter-image, per-page variants) are served: they used to redirect to
 * sign-in, so links shared on LinkedIn or WhatsApp had no preview.
 * API routes stay protected unless listed in isPublicRoute.
 */
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/api(.*)',
])

/** Dev-only routes: accessible in development; 404 in production */
const isDevOnlyRoute = createRouteMatcher([
  '/design-system(.*)',
])

/** Auth pages: redirect to dashboard when already signed in */
const isAuthPage = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
])

// ─── Middleware ───────────────────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req) => {
  // 0. Dev-only routes are 404 in production
  if (isDevOnlyRoute(req) && process.env.NODE_ENV === 'production') {
    return NextResponse.rewrite(new URL('/404', req.url))
  }

  const { userId } = await auth()

  // 1. Signed-in user on sign-in / sign-up: back to the page asked for, else the dashboard
  if (userId && isAuthPage(req)) {
    return NextResponse.redirect(new URL(returnPath(req), req.url))
  }

  // 2. Unauthenticated request on a protected route: sign-in for a page,
  //    a reload for a client navigation (lets Clerk refresh an expired
  //    session), a JSON 401 for the API (lib/security/signed-out).
  if (!userId && isProtectedRoute(req) && !isPublicRoute(req) && !isServerAction(req)) {
    return signedOutResponse(req)
  }

  // 3. Otherwise: pass through, with the Content-Security-Policy of the page
  return withContentSecurityPolicy(req)
})

/**
 * Signed-in surfaces get a strict policy with a per-request nonce, handed to
 * Next.js through the request headers so its scripts carry it; prerendered
 * public pages get the static policy (lib/security/csp explains both).
 */
function withContentSecurityPolicy(req: NextRequest): NextResponse {
  const dev = process.env.NODE_ENV !== 'production'
  if (!isStrictCspPath(req.nextUrl.pathname)) {
    const res = NextResponse.next()
    res.headers.set('Content-Security-Policy', staticCsp({ dev }))
    return res
  }
  const nonce = newNonce()
  const policy = strictCsp(nonce, { dev })
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', policy)
  return res
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
