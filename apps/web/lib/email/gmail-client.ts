/**
 * Phantera: Gmail API Client
 *
 * Handles:
 *   1. Sending emails via Gmail API (users.messages.send)
 *   2. Fetching new replies via Gmail History API (incremental sync)
 *   3. Automatic access token refresh before expiry
 *
 * Auth: OAuth 2.0: access + refresh tokens stored encrypted in ConnectedMailbox.
 * Scopes required: gmail.send, gmail.readonly
 */

import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/security/crypto'
import type { ProviderSendResult } from './sender-router'
import { isBounceMessage } from './bounce'

// ─── Header encoding ──────────────────────────────────────────────────────────

/**
 * Encodes an email header value as an RFC 2047 "encoded-word" when it contains
 * non-ASCII characters (accents, em-dashes, emojis…). Email headers must be
 * 7-bit ASCII; placing raw UTF-8 bytes in `Subject:` or a `From:` display name
 * produces mojibake (e.g. ", " -> "Ã¢Â€Â""). Pure-ASCII values are returned
 * untouched. The Gmail raw-MIME path is the only sender that hand-builds
 * headers : Outlook (Graph JSON) and SMTP (nodemailer) encode automatically.
 */
function encodeHeaderWord(value: string): string {
  // The full 7-bit range, NUL included, is exactly what "pure ASCII" means here.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GmailSendParams {
  accessToken:        string
  refreshToken:       string | null
  mailboxId:          string
  fromEmail:          string
  fromName?:          string
  to:                 string
  subject:            string
  html:               string
  listUnsubscribeUrl?: string
}

interface GmailFetchRepliesParams {
  accessToken:   string
  refreshToken:  string | null
  mailboxId:     string
  lastHistoryId: string | null
}

export interface GmailReply {
  messageId:        string
  threadId:         string
  fromEmail:        string
  subject:          string
  bodyText:         string
  receivedAt:       Date
  inReplyToHeader:  string | null
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt:   Date
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gmail token refresh failed: ${err}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt:   new Date(Date.now() + data.expires_in * 1000),
  }
}

/**
 * Ensure access token is valid: refreshes and persists if needed.
 * Returns a valid access token.
 */
export async function ensureValidToken(mailboxId: string, accessToken: string, refreshToken: string | null, expiresAt: Date | null): Promise<string> {
  const bufferMs = 5 * 60 * 1000 // refresh 5 min before expiry
  if (expiresAt && Date.now() < expiresAt.getTime() - bufferMs) {
    return accessToken
  }

  if (!refreshToken) {
    await db.connectedMailbox.update({
      where: { id: mailboxId },
      data:  { status: 'EXPIRED' },
    })
    throw new Error('Gmail token expired and no refresh token available')
  }

  const refreshed = await refreshAccessToken(refreshToken).catch(async (err: unknown) => {
    await db.connectedMailbox.update({
      where: { id: mailboxId },
      data:  { status: 'EXPIRED', lastSyncError: err instanceof Error ? err.message : String(err) },
    })
    throw err
  })

  await db.connectedMailbox.update({
    where: { id: mailboxId },
    data:  {
      accessTokenEnc: encrypt(refreshed.accessToken),
      tokenExpiresAt: refreshed.expiresAt,
      status:         'CONNECTED',
      lastSyncError:  null,
    },
  })

  return refreshed.accessToken
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendViaGmail(params: GmailSendParams): Promise<ProviderSendResult> {
  const mailbox = await db.connectedMailbox.findUnique({
    where:  { id: params.mailboxId },
    select: { tokenExpiresAt: true, refreshTokenEnc: true, status: true },
  })

  if (!mailbox || mailbox.status !== 'CONNECTED') {
    throw new Error(`Gmail mailbox ${params.mailboxId} is not connected`)
  }

  const refreshToken = mailbox.refreshTokenEnc ? decrypt(mailbox.refreshTokenEnc) : null
  const token = await ensureValidToken(
    params.mailboxId,
    params.accessToken,
    refreshToken,
    mailbox.tokenExpiresAt,
  )

  const fromHeader = params.fromName
    ? `${encodeHeaderWord(params.fromName)} <${params.fromEmail}>`
    : params.fromEmail

  // Build RFC 2822 email with custom headers
  const headers = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeaderWord(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ]

  if (params.listUnsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${params.listUnsubscribeUrl}>, <mailto:unsubscribe@phantera-tn.com?subject=unsubscribe>`)
    headers.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
  }

  const raw = [
    headers.join('\r\n'),
    '',
    params.html,
  ].join('\r\n')

  const encoded = Buffer.from(raw).toString('base64url')

  // Send with one retry on 401 (token may have expired between ensureValidToken
  // and the actual send: refresh + retry covers that race).
  let activeToken = token
  let res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: encoded }),
    },
  )

  if (res.status === 401 && refreshToken) {
    console.info('[gmail-client] send got 401, forcing token refresh and retrying once')
    activeToken = await ensureValidToken(params.mailboxId, params.accessToken, refreshToken, new Date(0))
    res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ raw: encoded }),
      },
    )
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gmail send failed: ${err}`)
  }

  const data = await res.json() as { id: string; threadId: string }

  // CRITICAL: Gmail's `id` field is the internal Gmail ID, NOT the RFC 2822 Message-ID.
  // The recipient's reply will carry the RFC 2822 Message-ID in its `In-Reply-To` header.
  // If we store data.id, reply matching ALWAYS fails. We must fetch the message metadata
  // and read the actual Message-ID header.
  let rfc2822MessageId: string | null = null
  try {
    const metaRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.id}?format=metadata&metadataHeaders=Message-Id`,
      { headers: { Authorization: `Bearer ${activeToken}` } },
    )
    if (metaRes.ok) {
      const meta = await metaRes.json() as {
        payload?: { headers?: Array<{ name: string; value: string }> }
      }
      const header = meta.payload?.headers?.find(
        (h) => h.name.toLowerCase() === 'message-id',
      )
      rfc2822MessageId = header?.value ?? null
    }
  } catch (err) {
    console.warn('[gmail-client] Failed to fetch Message-ID for', data.id, err)
  }

  return {
    messageId:         data.id,
    // Store RFC 2822 Message-ID so the reply matcher works.
    // Fallback to data.id if we couldn't fetch (rare: won't match replies but won't break sending).
    providerMessageId: rfc2822MessageId ?? data.id,
    providerThreadId:  data.threadId,
    provider:          'gmail',
  }
}

// ─── Fetch replies (History API) ──────────────────────────────────────────────

export async function fetchGmailReplies(params: GmailFetchRepliesParams): Promise<{
  replies:       GmailReply[]
  newHistoryId:  string
}> {
  // First sync: no historyId yet. We fetch recent inbox messages (last 24h)
  // via messages.list, process replies among them, AND capture current historyId
  // for incremental polling afterwards.
  if (!params.lastHistoryId) {
    const profileRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    )
    const profile = await profileRes.json() as { historyId: string }

    // Fetch recent inbox messages: last 48h, INBOX only
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    listUrl.searchParams.set('labelIds', 'INBOX')
    listUrl.searchParams.set('q', 'newer_than:2d')
    listUrl.searchParams.set('maxResults', '50')

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    })

    if (!listRes.ok) {
      return { replies: [], newHistoryId: profile.historyId }
    }

    const list = await listRes.json() as { messages?: Array<{ id: string }> }
    const messageIds = (list.messages ?? []).map((m) => m.id)
    const replies = await fetchAndFilterReplies(messageIds, params.accessToken)

    return { replies, newHistoryId: profile.historyId }
  }

  const fetchPage = async (pageToken: string | null): Promise<GmailHistoryPage | 'EXPIRED'> => {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history')
    url.searchParams.set('startHistoryId', params.lastHistoryId!)
    url.searchParams.set('historyTypes',   'messageAdded')
    url.searchParams.set('labelId',        'INBOX')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    })
    if (res.status === 404) return 'EXPIRED'
    if (!res.ok) throw new Error(`Gmail history fetch failed: ${await res.text()}`)
    return res.json() as Promise<GmailHistoryPage>
  }

  const collected = await collectGmailHistory(params.lastHistoryId, fetchPage)
  if (collected === 'EXPIRED') {
    // History ID expired (> 30 days): reset
    const profileRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    )
    const profile = await profileRes.json() as { historyId: string }
    return { replies: [], newHistoryId: profile.historyId }
  }

  const replies = await fetchAndFilterReplies(collected.messageIds, params.accessToken)
  return { replies, newHistoryId: collected.historyId }
}

interface GmailHistoryPage {
  history?: Array<{ id: string; messagesAdded?: Array<{ message: { id: string; threadId: string } }> }>
  historyId: string
  nextPageToken?: string
}

/** History pages read per poll; the next poll resumes after the last record read. */
export const GMAIL_MAX_HISTORY_PAGES = 20

/**
 * Reads every page of a Gmail history query (the API pages at 100 records and
 * the remaining pages used to be ignored). When the page budget runs out, the
 * returned cursor is the id of the last record read, so nothing is skipped.
 */
export async function collectGmailHistory(
  startHistoryId: string,
  fetchPage: (pageToken: string | null) => Promise<GmailHistoryPage | 'EXPIRED'>,
  maxPages = GMAIL_MAX_HISTORY_PAGES,
): Promise<{ messageIds: string[]; historyId: string } | 'EXPIRED'> {
  const messageIds: string[] = []
  let pageToken: string | null = null
  let lastRecordId: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const data = await fetchPage(pageToken)
    if (data === 'EXPIRED') return 'EXPIRED'
    for (const record of data.history ?? []) {
      lastRecordId = record.id
      for (const added of record.messagesAdded ?? []) messageIds.push(added.message.id)
    }
    if (!data.nextPageToken) return { messageIds, historyId: data.historyId }
    pageToken = data.nextPageToken
  }
  return { messageIds, historyId: lastRecordId ?? startHistoryId }
}

// ─── Shared reply-fetching helper ─────────────────────────────────────────────

/**
 * Given a list of Gmail message IDs, fetches each one and keeps only those
 * that look like replies (have In-Reply-To header AND non-empty body).
 */
async function fetchAndFilterReplies(
  messageIds: string[],
  accessToken: string,
): Promise<GmailReply[]> {
  const replies: GmailReply[] = []

  await Promise.allSettled(
    messageIds.map(async (id) => {
      // Headers first: unrelated messages are never downloaded in full.
      const metaRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=In-Reply-To&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!metaRes.ok) return
      const meta = await metaRes.json() as { payload?: { headers?: Array<{ name: string; value: string }> } }
      const metaHeader = (name: string) =>
        (meta.payload?.headers ?? []).find((h) => h.name.toLowerCase() === name)?.value ?? ''
      const isReply = metaHeader('in-reply-to') !== ''
      // Delivery failure notices often carry no In-Reply-To: keep them too.
      if (!isReply && !isBounceMessage(parseEmailAddress(metaHeader('from')), metaHeader('subject'))) return

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!msgRes.ok) return

      const msg = await msgRes.json() as {
        id:           string
        threadId:     string
        internalDate: string
        payload: {
          headers: Array<{ name: string; value: string }>
          body:    { data?: string }
          parts?:  Array<{ mimeType: string; body: { data?: string } }>
        }
      }

      const getHeader = (name: string) =>
        msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null

      const from      = getHeader('From') ?? ''
      const subject   = getHeader('Subject') ?? ''
      const inReplyTo = getHeader('In-Reply-To')

      if (!inReplyTo && !isBounceMessage(parseEmailAddress(from), subject)) return

      const bodyText = extractTextFromGmailPayload(msg.payload)
      if (!bodyText.trim()) return

      replies.push({
        messageId:       id,
        threadId:        msg.threadId,
        fromEmail:       parseEmailAddress(from),
        subject,
        bodyText,
        receivedAt:      new Date(parseInt(msg.internalDate, 10)),
        inReplyToHeader: inReplyTo,
      })
    }),
  )

  return replies
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTextFromGmailPayload(payload: {
  body:   { data?: string }
  parts?: Array<{ mimeType: string; body: { data?: string } }>
}): string {
  // Try plain text first, fall back to HTML stripped
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain')
    if (textPart?.body.data) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf8')
    }
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
    if (htmlPart?.body.data) {
      return Buffer.from(htmlPart.body.data, 'base64')
        .toString('utf8')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
  }
  if (payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8')
  }
  return ''
}

function parseEmailAddress(raw: string): string {
  const match = /<([^>]+)>/.exec(raw)
  return match?.[1] ?? raw.trim()
}
