/**
 * Minimal, dependency-free IMAP client (IMAPS / TLS) used to detect replies on
 * mailboxes connected through custom SMTP (Infomaniak, OVH, …). Gmail/Outlook
 * use their APIs (gmail-client / outlook-client); SMTP mailboxes had no reply
 * detection at all, so sequences kept following up leads who had answered.
 *
 * Scope is deliberately small: LOGIN -> SELECT INBOX -> UID SEARCH SINCE ->
 * UID FETCH headers + first text part -> LOGOUT. Read-only (BODY.PEEK), so
 * messages are never marked as read.
 */

import tls from 'node:tls'
import { resolvePublicHost } from '@/lib/security/private-network'
import { isBounceMessage } from './bounce'

export interface ImapReply {
  messageId: string
  inReplyToHeader: string | null
  fromEmail: string
  subject: string
  bodyText: string
  receivedAt: Date
}

export interface FetchImapRepliesParams {
  host: string
  port?: number
  user: string
  password: string
  since: Date
  /** Max messages inspected per poll (most recent first). */
  maxMessages?: number
  timeoutMs?: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** IMAP SINCE takes a date (no time), e.g. 06-Oct-2026. */
export function imapDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`
}

/** Largest single IMAP literal accepted (a header or a truncated body part). */
const MAX_LITERAL_BYTES = 1_000_000
/** Largest amount of unread data buffered from the server. */
const MAX_BUFFER_BYTES = 5_000_000
/** Hard ceiling for a whole poll of one mailbox, whatever the server does. */
const DEFAULT_DEADLINE_MS = 45_000

function quote(s: string): string {
  // CR, LF or NUL inside a quoted string would let a value inject IMAP commands.
  if (/[\r\n\0]/.test(s)) throw new Error('IMAP credentials contain forbidden control characters')
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** Derives the IMAP host from an SMTP host (smtp.x -> imap.x; mail.x stays). */
export function imapHostFromSmtp(smtpHost: string): string {
  return smtpHost.replace(/^smtp\./i, 'imap.')
}

// ─── Tiny IMAP session over TLS ─────────────────────────────────────────────

class ImapSession {
  private sock: tls.TLSSocket
  private buf = Buffer.alloc(0)
  private waiters: Array<() => void> = []
  private tagN = 0
  private closed = false
  private error: Error | null = null

  constructor(sock: tls.TLSSocket) {
    this.sock = sock
    sock.on('data', (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk])
      if (this.buf.length > MAX_BUFFER_BYTES) {
        sock.destroy(new Error('IMAP response too large'))
        return
      }
      this.wake()
    })
    sock.on('error', (e: Error) => { this.error = e; this.wake() })
    sock.on('close', () => { this.closed = true; this.wake() })
  }

  private wake() {
    const w = this.waiters
    this.waiters = []
    w.forEach((f) => f())
  }

  private async waitMore(): Promise<void> {
    if (this.error) throw this.error
    if (this.closed) throw new Error('IMAP connection closed')
    await new Promise<void>((r) => this.waiters.push(r))
    if (this.error) throw this.error
  }

  /** Reads one logical line, inlining literals {n}\r\n<bytes>. */
  async readLine(): Promise<string> {
    let out = ''
    for (;;) {
      const idx = this.buf.indexOf('\r\n')
      if (idx === -1) { await this.waitMore(); continue }
      const line = this.buf.subarray(0, idx).toString('utf8')
      const m = /\{(\d+)\}$/.exec(line)
      if (!m) {
        this.buf = this.buf.subarray(idx + 2)
        return out + line
      }
      const n = Number(m[1])
      if (n > MAX_LITERAL_BYTES) throw new Error('IMAP literal too large')
      while (this.buf.length < idx + 2 + n) await this.waitMore()
      const literal = this.buf.subarray(idx + 2, idx + 2 + n).toString('utf8')
      this.buf = this.buf.subarray(idx + 2 + n)
      out += line.slice(0, m.index) + JSON.stringify(literal)
    }
  }

  async greeting(): Promise<void> {
    const l = await this.readLine()
    if (!/^\* (OK|PREAUTH)/i.test(l)) throw new Error(`IMAP greeting: ${l.slice(0, 120)}`)
  }

  /** Sends a command; returns the untagged lines. Throws on NO/BAD. */
  async cmd(command: string): Promise<string[]> {
    const tag = `A${++this.tagN}`
    this.sock.write(`${tag} ${command}\r\n`)
    const lines: string[] = []
    for (;;) {
      const l = await this.readLine()
      if (l.startsWith(`${tag} `)) {
        if (!/^\S+ OK/i.test(l)) throw new Error(`IMAP ${command.split(' ')[0]} failed: ${l.slice(tag.length + 1, 200)}`)
        return lines
      }
      lines.push(l)
    }
  }

  end() { try { this.sock.end() } catch { /* ignore */ } }
}

// ─── MIME helpers ───────────────────────────────────────────────────────────

function unfoldHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ')
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const k = line.slice(0, i).trim().toLowerCase()
    if (!(k in out)) out[k] = line.slice(i + 1).trim()
  }
  return out
}

function decodeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_m, _cs, enc: string, txt: string) => {
    try {
      if (enc.toUpperCase() === 'B') return Buffer.from(txt, 'base64').toString('utf8')
      return decodeQP(txt.replace(/_/g, ' '))
    } catch { return txt }
  })
}

function decodeQP(s: string): string {
  const bytes: number[] = []
  const src = s.replace(/=\r?\n/g, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16)); i += 2
    } else {
      bytes.push(...Buffer.from(c, 'utf8'))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

function decodePart(body: string, encoding: string | undefined): string {
  const enc = (encoding ?? '').toLowerCase()
  if (enc.includes('base64')) {
    try { return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8') } catch { return body }
  }
  if (enc.includes('quoted-printable')) return decodeQP(body)
  return body
}

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim()
}

/** Extracts readable text from a message body given its top-level headers. */
export function extractText(headers: Record<string, string>, body: string): string {
  const ctype = headers['content-type'] ?? 'text/plain'
  const boundary = /boundary="?([^";]+)"?/i.exec(ctype)?.[1]
  if (!boundary) {
    const txt = decodePart(body, headers['content-transfer-encoding'])
    return /text\/html/i.test(ctype) ? stripHtml(txt) : txt.trim()
  }
  const parts = body.split(`--${boundary}`).slice(1)
  let htmlFallback = ''
  for (const p of parts) {
    if (p.startsWith('--')) break
    const sep = p.search(/\r?\n\r?\n/)
    if (sep === -1) continue
    const ph = unfoldHeaders(p.slice(0, sep))
    const pb = p.slice(sep).replace(/^\r?\n\r?\n/, '')
    const pt = ph['content-type'] ?? 'text/plain'
    if (/multipart\//i.test(pt)) {
      const inner = extractText(ph, pb)
      if (inner) return inner
    } else if (/text\/plain/i.test(pt)) {
      return decodePart(pb, ph['content-transfer-encoding']).trim()
    } else if (/text\/html/i.test(pt) && !htmlFallback) {
      htmlFallback = stripHtml(decodePart(pb, ph['content-transfer-encoding']))
    }
  }
  return htmlFallback
}

function firstAddress(from: string): string {
  return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase()
}

function lastMessageId(s: string | undefined): string | null {
  if (!s) return null
  const ids = s.match(/<[^>]+>/g)
  return ids && ids.length ? ids[ids.length - 1] : null
}

/**
 * Turns the untagged lines of a `UID FETCH (INTERNALDATE BODY.PEEK[HEADER]
 * BODY.PEEK[TEXT])` response into replies. A message that cannot be parsed is
 * skipped on its own: one malformed email must never block reply detection
 * for the whole mailbox.
 */
export function parseFetchLines(lines: string[], user: string): ImapReply[] {
  const replies: ImapReply[] = []
  for (const line of lines) {
    if (!/^\* \d+ FETCH/i.test(line)) continue
    try {
      const reply = parseFetchLine(line, user)
      if (reply) replies.push(reply)
    } catch (err) {
      // Only the error type: parser messages can quote the email content.
      console.warn('[imap] skipped unparsable message:', err instanceof Error ? err.name : 'Error')
    }
  }
  return replies
}

function parseFetchLine(line: string, user: string): ImapReply | null {
  const internal = /INTERNALDATE "([^"]+)"/i.exec(line)?.[1]
  const literals = [...line.matchAll(/BODY\[(HEADER|TEXT)\](?:<\d+>)? ("(?:[^"\\]|\\.)*")/gi)]
  const get = (k: string) => {
    const m = literals.find((x) => x[1].toUpperCase() === k)
    return m ? (JSON.parse(m[2]) as string) : ''
  }
  const h = unfoldHeaders(get('HEADER'))
  const inReplyTo = lastMessageId(h['in-reply-to']) ?? lastMessageId(h['references'])
  const subject = decodeWords(h['subject'] ?? '')
  // Delivery failure notices often carry no In-Reply-To: keep them too.
  if (!inReplyTo && !isBounceMessage(firstAddress(h['from'] ?? ''), subject)) return null
  const receivedAt = internal ? new Date(internal) : new Date()
  return {
    messageId: (/<[^>]+>/.exec(h['message-id'] ?? '')?.[0]) ?? `imap-${user}-${internal ?? ''}`,
    inReplyToHeader: inReplyTo,
    fromEmail: firstAddress(h['from'] ?? ''),
    subject,
    bodyText: extractText(h, get('TEXT')).slice(0, 10_000),
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns messages received since `since` that are replies (carry an
 * In-Reply-To or References header). Matching to an EmailSend is done by the
 * caller (poll-inboxes -> processReply) via the In-Reply-To message id.
 */
export async function fetchImapReplies(params: FetchImapRepliesParams): Promise<ImapReply[]> {
  const { host, port = 993, user, password, since, maxMessages = 50, timeoutMs = 20_000 } = params

  // Built before connecting so unsafe credentials never reach the network.
  const login = `LOGIN ${quote(user)} ${quote(password)}`

  // The host comes from user input: connect only to the public address we
  // checked; the certificate is still verified against the host name.
  const address = await resolvePublicHost(host)
  const sock = tls.connect({ host: address, port, servername: host })
  sock.setTimeout(timeoutMs, () => sock.destroy(new Error('IMAP timeout')))
  // Inactivity timeouts never fire on a server that keeps streaming.
  const deadline = setTimeout(() => sock.destroy(new Error('IMAP deadline exceeded')), DEFAULT_DEADLINE_MS)
  sock.once('close', () => clearTimeout(deadline))
  await new Promise<void>((resolve, reject) => {
    sock.once('secureConnect', () => resolve())
    sock.once('error', reject)
  })
  const s = new ImapSession(sock)

  try {
    await s.greeting()
    await s.cmd(login)
    await s.cmd('SELECT INBOX')
    const search = await s.cmd(`UID SEARCH SINCE ${imapDate(since)}`)
    const uids = search
      .filter((l) => /^\* SEARCH/i.test(l))
      .flatMap((l) => l.replace(/^\* SEARCH/i, '').trim().split(/\s+/))
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)
      .slice(0, maxMessages)
    if (uids.length === 0) return []

    const lines = await s.cmd(
      `UID FETCH ${uids.join(',')} (INTERNALDATE BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.20000>)`,
    )

    return parseFetchLines(lines, user)
  } finally {
    clearTimeout(deadline)
    try { await s.cmd('LOGOUT') } catch { /* ignore */ }
    s.end()
  }
}
