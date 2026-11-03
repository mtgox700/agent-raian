/**
 * Every server entry point that does NOT go through requireAccess, with why
 * that is safe and the guard the file must contain. The inventory test fails
 * on any route or server action that is neither here nor calling the access
 * layer, so a new route cannot quietly skip authorisation.
 */

export interface PublicSurface {
  reason: string
  /** Text the file must contain: the guard that replaces requireAccess. Null when public by design. */
  guard: string | null
}

export const PUBLIC_SURFACES: Record<string, PublicSurface> = {
  'app/api/cron/daily-digest/route.ts':      { reason: 'Vercel cron', guard: 'CRON_SECRET' },
  'app/api/cron/poll-inboxes/route.ts':      { reason: 'Vercel cron', guard: 'CRON_SECRET' },
  'app/api/cron/process-sequences/route.ts': { reason: 'Vercel cron', guard: 'CRON_SECRET' },
  'app/api/inngest/route.ts':                { reason: 'Inngest endpoint, requests signed and verified by the SDK', guard: 'serve(' },
  'app/api/security/redteam/route.ts':       { reason: 'Red-team probe, off unless enabled, secret required', guard: 'REDTEAM_SECRET' },
  'app/api/webhooks/apollo-phone/route.ts':  { reason: 'Apollo webhook, one-time token per lookup', guard: 'handleRevealWebhook' },
  'app/api/webhooks/brevo-sms/route.ts':     { reason: 'Brevo webhook, HMAC token per workspace', guard: 'verifySmsWebhookToken' },
  'app/api/webhooks/clerk/route.ts':         { reason: 'Clerk webhook, Svix signature', guard: '.verify(' },
  'app/api/webhooks/inbound-email/route.ts': { reason: 'Inbound email worker, shared secret', guard: 'SECRET' },
  'app/api/webhooks/resend/route.ts':        { reason: 'Resend webhook, Svix signature', guard: '.verify(' },
  'app/api/webhooks/stripe/route.ts':        { reason: 'Stripe webhook, signature', guard: 'constructEvent' },
  'app/api/webhooks/unipile/route.ts':       { reason: 'Unipile webhook, shared secret', guard: 'verifyUnipileWebhook' },
  'app/api/webhooks/unsubscribe/route.ts':   { reason: 'Unsubscribe link in emails, keyed by an unguessable send id', guard: null },
  'app/api/track/open/route.ts':             { reason: 'Open pixel, keyed by an unguessable send id', guard: null },
  'app/api/track/whatsapp/route.ts':         { reason: 'WhatsApp link in emails, keyed by an unguessable send id', guard: null },
  'app/api/health/route.ts':                 { reason: 'Liveness probe, no data', guard: null },
  'app/api/mcp/route.ts':                    { reason: 'Public product description (plans, features), no workspace data', guard: null },
  'app/blog/rss.xml/route.ts':               { reason: 'Public blog feed', guard: null },
  'app/llms.txt/route.ts':                   { reason: 'Public product description for AI assistants', guard: null },
  'app/(auth)/onboarding/actions.ts':        { reason: 'Creates the signed-in user\'s own first workspace', guard: 'auth()' },
  'app/(auth)/onboarding/layout.tsx':        { reason: 'Only reads whether the signed-in user is already set up', guard: 'auth()' },
  'app/invite/[token]/page.tsx':             { reason: 'Invitation page: the token is the key, nothing is shown for an unusable one', guard: 'readInvitation' },
  'app/invite/[token]/actions.ts':           { reason: 'Joining needs a session and a verified e-mail equal to the invited one; token single use', guard: 'verifiedEmails' },
  'app/invite/[token]/start/route.ts':       { reason: 'Keeps a valid invitation token in a cookie before Clerk sign-in/up', guard: 'readInvitation' },
  'app/invite/resume/route.ts':              { reason: 'Sends back to the kept invitation once, consuming the cookie', guard: 'hashInvitationToken' },
}
