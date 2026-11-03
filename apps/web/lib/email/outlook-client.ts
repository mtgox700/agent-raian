/**
 * Phantera: Microsoft Graph / Outlook Client
 *
 * Handles:
 *   1. Sending emails via Microsoft Graph API (sendMail)
 *   2. Fetching new replies via Graph Delta Query (incremental sync)
 *   3. Automatic access token refresh before expiry
 *
 * Auth: OAuth 2.0 (MSAL flow): tokens stored encrypted in ConnectedMailbox.
 * Scopes: Mail.Send, Mail.Read, offline_access
 */

import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/security/crypto'
import type { ProviderSendResult } from './sender-router'
import { isBounceMessage } from './bounce'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutlookSendParams {
  accessToken:         string
  refreshToken:        string | null
  mailboxId:           string
  fromEmail:           string
  to:                  string
  subject:             string
  html:                string
  listUnsubscribeUrl?: string
}

export interface OutlookReply {
  messageId:       string
  fromEmail:       string
  subject:         string
  bodyText:        string
  receivedAt:      Date
  inReplyToHeader: string | null
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshOutlookToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt:   Date
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
        scope:         'Mail.Send Mail.Read offline_access',
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`Outlook token refresh failed: ${await res.text()}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt:   new Date(Date.now() + data.expires_in * 1000),
  }
}

async function ensureValidOutlookToken(
  mailboxId:    string,
  accessToken:  string,
  refreshToken: string | null,
  expiresAt:    Date | null,
): Promise<string> {
  const bufferMs = 5 * 60 * 1000
  if (expiresAt && Date.now() < expiresAt.getTime() - bufferMs) return accessToken
  if (!refreshToken) {
    await db.connectedMailbox.update({ where: { id: mailboxId }, data: { status: 'EXPIRED' } })
    throw new Error('Outlook token expired and no refresh token available')
  }

  const refreshed = await refreshOutlookToken(refreshToken).catch(async (err: unknown) => {
    await db.connectedMailbox.update({
      where: { id: mailboxId },
      data:  { status: 'EXPIRED', lastSyncError: err instanceof Error ? err.message : String(err) },
    })
    throw err
  })

  await db.connectedMailbox.update({
    where: { id: mailboxId },
    data:  { accessTokenEnc: encrypt(refreshed.accessToken), tokenExpiresAt: refreshed.expiresAt, status: 'CONNECTED', lastSyncError: null },
  })

  return refreshed.accessToken
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendViaOutlook(params: OutlookSendParams): Promise<ProviderSendResult> {
  const mailbox = await db.connectedMailbox.findUnique({
    where:  { id: params.mailboxId },
    select: { tokenExpiresAt: true, refreshTokenEnc: true, status: true },
  })
  if (!mailbox || mailbox.status !== 'CONNECTED') {
    throw new Error(`Outlook mailbox ${params.mailboxId} is not connected`)
  }

  const refreshToken = mailbox.refreshTokenEnc ? decrypt(mailbox.refreshTokenEnc) : null
  const token = await ensureValidOutlookToken(
    params.mailboxId, params.accessToken, refreshToken, mailbox.tokenExpiresAt,
  )

  const customHeaders: Array<{ name: string; value: string }> = []
  if (params.listUnsubscribeUrl) {
    customHeaders.push(
      { name: 'List-Unsubscribe', value: `<${params.listUnsubscribeUrl}>, <mailto:unsubscribe@phantera-tn.com?subject=unsubscribe>` },
      { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
    )
  }

  const body: Record<string, unknown> = {
    message: {
      subject:    params.subject,
      body:       { contentType: 'HTML', content: params.html },
      toRecipients: [{ emailAddress: { address: params.to } }],
      from:         { emailAddress: { address: params.fromEmail } },
      internetMessageHeaders: customHeaders,
    },
    saveToSentItems: true,
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Outlook send failed: ${await res.text()}`)
  }

  // Graph sendMail returns 202 with no body: use X-MS-Exchange-Message-Id from sent items
  // We query the last sent item to get the actual message ID
  const sentRes = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$top=1&$orderby=sentDateTime desc&$select=id,internetMessageId',
    { headers: { Authorization: `Bearer ${token}` } },
  )

  // CRITICAL: We must store the RFC 2822 `internetMessageId` (e.g. <abc@outlook.com>)
  // not the internal Graph `id`: replies carry `internetMessageId` in their In-Reply-To header.
  let providerMessageId: string | null = null
  let internalMessageId: string | null = null
  if (sentRes.ok) {
    const sentData = await sentRes.json() as { value: Array<{ id: string; internetMessageId: string }> }
    providerMessageId  = sentData.value[0]?.internetMessageId ?? null
    internalMessageId  = sentData.value[0]?.id ?? null
  }

  return {
    messageId:         internalMessageId ?? `outlook_${Date.now()}`,
    providerMessageId,
    providerThreadId:  null,
    provider:          'outlook',
  }
}

// ─── Fetch replies (Delta Query) ──────────────────────────────────────────────

interface OutlookDeltaMessage {
  id:               string
  subject:          string
  from:             { emailAddress: { address: string } }
  body:             { content: string; contentType: string }
  receivedDateTime: string
  internetMessageHeaders?: Array<{ name: string; value: string }>
}

interface OutlookDeltaPage {
  value: OutlookDeltaMessage[]
  '@odata.deltaLink'?: string
  '@odata.nextLink'?:  string
}

/** Pages read per poll; the cursor resumes from where we stopped. */
export const OUTLOOK_MAX_DELTA_PAGES = 20

/**
 * Walks a Graph delta query: follows every `@odata.nextLink` until the final
 * `@odata.deltaLink`. If the page budget runs out first, the next page link
 * becomes the cursor, so the following poll resumes there instead of reading
 * the first page again (which used to hide every reply past the 50th message).
 */
export async function collectOutlookDelta(
  startUrl: string,
  fetchPage: (url: string) => Promise<OutlookDeltaPage>,
  maxPages = OUTLOOK_MAX_DELTA_PAGES,
): Promise<{ messages: OutlookDeltaMessage[]; cursor: string }> {
  const messages: OutlookDeltaMessage[] = []
  let url = startUrl
  for (let page = 0; page < maxPages; page++) {
    const data = await fetchPage(url)
    messages.push(...data.value)
    if (data['@odata.deltaLink']) return { messages, cursor: data['@odata.deltaLink'] }
    if (!data['@odata.nextLink']) return { messages, cursor: url }
    url = data['@odata.nextLink']
  }
  return { messages, cursor: url }
}

export async function fetchOutlookReplies(params: {
  accessToken:   string
  refreshToken:  string | null
  mailboxId:     string
  lastDeltaLink: string | null
}): Promise<{ replies: OutlookReply[]; newDeltaLink: string }> {
  const token = await ensureValidOutlookToken(
    params.mailboxId, params.accessToken, params.refreshToken, null,
  )

  const startUrl = params.lastDeltaLink
    ?? 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$select=id,subject,from,body,receivedDateTime,internetMessageHeaders'

  const { messages, cursor } = await collectOutlookDelta(startUrl, async (url) => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'odata.maxpagesize=50' },
    })
    if (!res.ok) throw new Error(`Outlook delta fetch failed: ${await res.text()}`)
    return res.json() as Promise<OutlookDeltaPage>
  })

  const replies: OutlookReply[] = []
  for (const msg of messages) {
    const inReplyTo = msg.internetMessageHeaders
      ?.find((h) => h.name.toLowerCase() === 'in-reply-to')?.value ?? null

    const fromAddress = msg.from?.emailAddress?.address ?? ''
    // Delivery failure notices often carry no In-Reply-To: keep them too.
    if (!inReplyTo && !isBounceMessage(fromAddress, msg.subject ?? '')) continue

    const bodyText = msg.body.contentType === 'html'
      ? msg.body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : msg.body.content

    replies.push({
      messageId:       msg.id,
      fromEmail:       fromAddress,
      subject:         msg.subject ?? '',
      bodyText,
      receivedAt:      new Date(msg.receivedDateTime),
      inReplyToHeader: inReplyTo,
    })
  }

  return { replies, newDeltaLink: cursor }
}
