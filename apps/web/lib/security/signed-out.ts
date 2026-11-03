/**
 * What a protected request without a valid session gets back.
 *
 * Clerk can only refresh an expired session token on a document request
 * (its handshake is a redirect). A click in the menu is not one: it is a
 * React Server Components fetch, and with an expired token Clerk reports
 * "signed out" although the browser holds a live session. Redirecting that
 * fetch to /sign-in sent people to the sign-in page in the middle of their
 * work (a tab left in the background, a slow network, a sleeping laptop).
 *
 *   document     -> /sign-in, with the way back (a real sign-out)
 *   client fetch -> a plain 401 (RSC navigation or prefetch): the Next router
 *                  answers any non-RSC response with a full page load of the
 *                  same URL, which is a document
 *                  request, so Clerk refreshes the session and the page opens
 *   API fetch    -> JSON 401, never an HTML page a fetch() would choke on
 */

import { NextResponse, type NextRequest } from 'next/server'

export const SESSION_EXPIRED_MESSAGE = 'Session expirée : rechargez la page pour continuer.'

/**
 * A page load, as opposed to a fetch. Next strips its RSC headers before the
 * middleware runs, so this uses the signal Clerk itself uses for its
 * handshake: Sec-Fetch-Dest, or the Accept header when the browser sends none.
 */
export function isDocumentRequest(req: Pick<NextRequest, 'headers'>): boolean {
  const dest = req.headers.get('sec-fetch-dest')
  if (dest) return dest === 'document' || dest === 'iframe'
  return (req.headers.get('accept') ?? '').startsWith('text/html')
}

/**
 * A server action (POST with Next's action header). It is let through even
 * signed out: Next can only read an RSC answer, so a 401 or a redirect from
 * here surfaced as "An unexpected response was received from the server".
 * Every action checks the session itself and redirects cleanly
 * (guarded by server-actions-auth.test.ts).
 */
export function isServerAction(req: Pick<NextRequest, 'method' | 'headers'>): boolean {
  return req.method === 'POST' && req.headers.has('next-action')
}

export function isApiRequest(req: Pick<NextRequest, 'nextUrl'>): boolean {
  return req.nextUrl.pathname === '/api' || req.nextUrl.pathname.startsWith('/api/')
}

export function signedOutResponse(req: NextRequest): NextResponse {
  if (isApiRequest(req)) {
    return NextResponse.json({ error: SESSION_EXPIRED_MESSAGE, code: 'session_expired' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!isDocumentRequest(req)) {
    return new NextResponse(SESSION_EXPIRED_MESSAGE, { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  const signInUrl = new URL('/sign-in', req.url)
  signInUrl.searchParams.set('redirect_url', req.url)
  return NextResponse.redirect(signInUrl)
}

const HOME = '/dashboard'
const AUTH_PAGE = /^\/sign-(?:in|up)(?:\/|$)/

/**
 * Where a signed-in visit to /sign-in or /sign-up goes. Clerk refreshes an
 * expired session right on /sign-in?redirect_url=…: going back to that page,
 * not to the dashboard, is what makes the expiry invisible. Only a path of
 * this site is followed (the URL parser settles "//host", "\host", userinfo
 * and schemes by origin); anything else, or an auth page, is the dashboard.
 */
export function returnPath(req: Pick<NextRequest, 'nextUrl'>): string {
  return safeReturnPath(req.nextUrl.searchParams.get('redirect_url'), req.nextUrl.origin)
}

/**
 * The same rule for the sign-in page: when the browser still holds a session
 * the server did not see, Clerk's form redirects on its own, to its fallback
 * URL, without reading redirect_url. The page hands it this path instead.
 */
export function safeReturnPath(raw: string | string[] | null | undefined, origin: string): string {
  if (typeof raw !== 'string' || !raw) return HOME
  let target: URL
  try {
    target = new URL(raw, origin)
  } catch {
    return HOME
  }
  if (target.origin !== origin || AUTH_PAGE.test(target.pathname)) return HOME
  return `${target.pathname}${target.search}${target.hash}`
}
