/**
 * Chassis middleware: every /api route needs a Clerk session, except the
 * public surfaces below, each guarded inside its handler (signature, secret
 * or token: see lib/auth/public-surfaces.ts). Answers JSON 401 otherwise.
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { signedOutResponse } from '@/lib/security/signed-out'

const isPublicApi = createRouteMatcher([
  '/api/webhooks(.*)',
  '/api/track(.*)',       // tracking pixel — called by email clients (no session cookie)
  '/api/health',          // liveness probe (uptime / CI)
  '/api/cron(.*)',        // Vercel cron: no session, guarded by CRON_SECRET in each route
  '/api/inngest(.*)',     // Inngest serve endpoint (signed requests, verified by SDK)
  '/api/security/redteam(.*)', // garak red-team probe — gated by ENABLE_REDTEAM + secret
  '/api/mcp(.*)',
  '/api/views/invite/(.*)', // invitation page data: the token is the key (signed-out visitors too)
  '/api/invitations/(.*)', // invitation start / resume / accept: token-guarded, redirect to sign-in themselves
])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApi(req)) return NextResponse.next()
  const { userId } = await auth()
  if (!userId) return signedOutResponse(req)
  return NextResponse.next()
})

export const config = {
  matcher: ['/api/:path*'],
}
