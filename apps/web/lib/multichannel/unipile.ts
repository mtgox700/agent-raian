/**
 * Phantera: Unipile multichannel adapter (LinkedIn + email + WhatsApp).
 *
 * Unipile is a unified messaging API: we connect a user's own LinkedIn / mailbox
 * via Unipile's hosted auth, then send "on behalf of the user". This keeps the
 * channel transport off our plate while we own the cross-channel sequencer.
 *
 * Strategy guardrails (docs/VEILLE_SDR_PRICING_MULTICANAL.md): LinkedIn is a ToS
 * gray zone: the SEQUENCER must enforce conservative daily caps, per-account
 * proxy, and human-in-the-loop. This adapter only performs the transport.
 *
 * Config: UNIPILE_DSN (e.g. https://api1.unipile.com:13111), UNIPILE_API_KEY.
 * Env-gated + fetch-based + unit-tested with mocked fetch. Endpoints follow the
 * Unipile v1 API: verify against current docs when wiring the live key.
 */

import { fitInviteNote } from './linkedin-limits'

export function isUnipileConfigured(): boolean {
  return !!(process.env.UNIPILE_DSN && process.env.UNIPILE_API_KEY)
}

function base(): string {
  // Defensive: strip quotes/whitespace: a pasted `"https://…" ` in the env
  // panel makes fetch() throw "Failed to parse URL" on EVERY call (2026-07-11).
  return (process.env.UNIPILE_DSN ?? '').trim().replace(/^["']|["']$/g, '').replace(/\/$/, '')
}

function headers(): Record<string, string> {
  return {
    'X-API-KEY': (process.env.UNIPILE_API_KEY ?? '').trim().replace(/^["']|["']$/g, ''),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export interface SendResult {
  providerMessageId: string | null
  channel: 'linkedin' | 'email'
}

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Unipile ${path} failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  return (await res.json()) as Record<string, unknown>
}

export interface LinkedInMessageParams {
  /** The connected Unipile account id (the user's LinkedIn). */
  accountId: string
  /** Recipient's LinkedIn provider id. */
  recipientProviderId: string
  text: string
}

/** Send a LinkedIn direct message (starts/continues a chat). */
export async function sendLinkedInMessage(params: LinkedInMessageParams): Promise<SendResult> {
  const data = await postJson('/api/v1/chats', {
    account_id: params.accountId,
    attendees_ids: [params.recipientProviderId],
    text: params.text,
  })
  const id = (data.message_id ?? data.id ?? data.chat_id) as string | undefined
  return { providerMessageId: id ?? null, channel: 'linkedin' }
}

/**
 * Send a LinkedIn CONNECTION INVITATION. Free LinkedIn accounts cannot DM
 * non-connections (Unipile 403 errors/subscription_required): the standard
 * outreach flow is invite -> wait for accept -> DM. Personalized notes are
 * heavily rate-limited on free accounts, so on note rejection we retry bare.
 */
export async function sendLinkedInInvitation(params: {
  accountId: string
  recipientProviderId: string
  note?: string
}): Promise<void> {
  const body: Record<string, unknown> = {
    account_id:  params.accountId,
    provider_id: params.recipientProviderId,
  }
  // LinkedIn caps invitation notes at 300 chars on EVERY plan. `fitInviteNote`
  // cuts on a sentence or word boundary: the previous `slice(0, 275)` shipped
  // notes ending mid-word (founder report, 2026-09-03). This is the last-resort
  // safety net: the note should already fit, generated for this exact format.
  if (params.note) body.message = fitInviteNote(params.note)
  try {
    await postJson('/api/v1/users/invite', body)
  } catch (err) {
    // Note quota exhausted / notes not allowed -> plain invitation still works.
    if (params.note) {
      await postJson('/api/v1/users/invite', {
        account_id: params.accountId, provider_id: params.recipientProviderId,
      })
      return
    }
    throw err
  }
}

export interface UnipileEmailParams {
  accountId: string
  to: string
  toName?: string
  subject: string
  body: string
}

/** Send an email through a Unipile-connected mailbox (Gmail/Outlook). */
export async function sendUnipileEmail(params: UnipileEmailParams): Promise<SendResult> {
  const data = await postJson('/api/v1/emails', {
    account_id: params.accountId,
    to: [{ display_name: params.toName ?? params.to, identifier: params.to }],
    subject: params.subject,
    body: params.body,
  })
  const id = (data.email_id ?? data.id ?? data.message_id) as string | undefined
  return { providerMessageId: id ?? null, channel: 'email' }
}

// ─── Hosted auth (account connection) ─────────────────────────────────────────

export interface HostedAuthParams {
  /** Which provider the user is connecting. */
  provider: 'LINKEDIN' | 'WHATSAPP'
  /** Our internal reference (ConnectedChannel.id): echoed back in the notify. */
  name: string
  /** Where Unipile redirects the user after success / failure. */
  successRedirectUrl: string
  failureRedirectUrl: string
  /** Server-to-server callback that receives { status, account_id, name }. */
  notifyUrl: string
}

/**
 * Create a Unipile hosted-auth link: the user opens it, logs into the provider
 * on Unipile's page (QR for WhatsApp, credentials/cookies for LinkedIn), and
 * Unipile calls `notifyUrl` with the new account_id. Link expires in 1 hour.
 */
export async function createHostedAuthLink(params: HostedAuthParams): Promise<string> {
  const data = await postJson('/api/v1/hosted/accounts/link', {
    type: 'create',
    providers: [params.provider],
    api_url: base(),
    expiresOn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    name: params.name,
    success_redirect_url: params.successRedirectUrl,
    failure_redirect_url: params.failureRedirectUrl,
    notify_url: params.notifyUrl,
  })
  const url = data.url as string | undefined
  if (!url) throw new Error('Unipile hosted auth: no url in response')
  return url
}

/** Disconnect (delete) a Unipile account: used when the user removes a channel. */
export async function deleteUnipileAccount(accountId: string): Promise<void> {
  const res = await fetch(`${base()}/api/v1/accounts/${accountId}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Unipile delete account failed (${res.status}): ${detail.slice(0, 200)}`)
  }
}

// ─── Account listing (reconciliation) ─────────────────────────────────────────

export interface UnipileAccount {
  id: string
  type: string          // 'LINKEDIN' | 'WHATSAPP' | 'GOOGLE' | ...
  name: string | null   // provider-side display name
  createdAt: Date | null
}

/**
 * List all accounts connected on the Unipile workspace. Used to RECONCILE
 * PENDING channels when the hosted-auth notify webhook was lost (e.g. the
 * flow was tested from localhost, unreachable by Unipile).
 */
export async function listUnipileAccounts(): Promise<UnipileAccount[]> {
  const res = await fetch(`${base()}/api/v1/accounts`, { headers: headers() })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Unipile list accounts failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as { items?: Array<Record<string, unknown>> }
  return (data.items ?? []).map((a) => ({
    id:   String(a.id ?? ''),
    type: String(a.type ?? a.provider ?? '').toUpperCase(),
    name: typeof a.name === 'string' ? a.name : null,
    createdAt: typeof a.created_at === 'string' && !Number.isNaN(Date.parse(a.created_at)) ? new Date(a.created_at) : null,
  })).filter((a) => a.id)
}

// ─── Recipient resolution ─────────────────────────────────────────────────────

/** Extract the public identifier from a LinkedIn profile URL (…/in/<slug>). */
export function linkedInPublicIdentifier(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Resolve a LinkedIn profile's provider_id (required by the chats API) from
 * its public identifier, via the connected account's session.
 */
export async function resolveLinkedInProviderId(
  accountId: string,
  publicIdentifier: string,
): Promise<string | null> {
  const res = await fetch(
    `${base()}/api/v1/users/${encodeURIComponent(publicIdentifier)}?account_id=${encodeURIComponent(accountId)}`,
    { headers: headers() },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { provider_id?: string; id?: string }
  return data.provider_id ?? data.id ?? null
}
