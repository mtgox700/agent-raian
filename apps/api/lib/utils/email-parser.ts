/**
 * email-parser.ts
 *
 * Extracts the clean, human-written reply text from a raw RFC 2822 email.
 *
 * Strategy (in priority order):
 *  1. Use `mailparser` (simpleParser) on the raw MIME string: handles
 *     multipart/alternative, quoted-printable, base64, UTF-8 transparently.
 *  2. Fall back to the pre-parsed `text` field from the Cloudflare worker
 *     if it looks clean (no MIME boundaries, no headers).
 *  3. Last resort: brute-force strip HTML tags + QP-decode the raw string.
 *
 * After extraction, `stripQuotedReply` removes the forwarded / quoted thread
 * so only the lead's actual words are stored and sent to Claude for classification.
 */

import { simpleParser } from 'mailparser'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the clean, human-written reply body (max 600 chars).
 *
 * @param raw   - Full RFC 2822 email string (from Cloudflare worker `message.raw`)
 * @param text  - Optional pre-parsed text field sent by the worker
 */
export async function extractEmailBody(raw: string, text?: string): Promise<string> {
  // ── Strategy 1: mailparser on raw ─────────────────────────────────────────
  if (raw && raw.trim().length > 0) {
    try {
      const parsed = await simpleParser(raw, {
        skipHtmlToText:      false,  // let mailparser convert HTML → text
        skipImageLinks:      true,
        skipTextToHtml:      true,
        skipTextLinks:       true,
      })

      // Prefer the text/plain part; fall back to HTML ->text conversion
      const body = parsed.text ?? parsed.textAsHtml ?? ''

      if (body.trim().length > 5) {
        return stripQuotedReply(body).slice(0, 600)
      }
    } catch (err) {
      console.warn('[email-parser] mailparser failed, trying fallback:', err)
    }
  }

  // ── Strategy 2: pre-parsed text field ─────────────────────────────────────
  if (text && text.trim().length > 5) {
    const cleaned = legacyClean(text)
    if (cleaned.length > 5 && !hasMimeBoundary(cleaned)) {
      return stripQuotedReply(cleaned).slice(0, 600)
    }
  }

  // ── Strategy 3: brute-force on raw ────────────────────────────────────────
  if (raw) {
    const bruteForce = bruteForceParse(raw)
    return stripQuotedReply(bruteForce).slice(0, 600)
  }

  return ''
}

// ─── Quoted-reply stripping ───────────────────────────────────────────────────

/**
 * Removes the forwarded / quoted thread from an email body.
 *
 * Detects common reply separators:
 *  - Gmail:   "On Mon, Apr 21, 2026 at 10:00 AM, Phantera <...> wrote:"
 *  - Gmail FR:"Le lun. 21 avr. 2026 à 10:00, Phantera <...> a écrit :"
 *  - Outlook: "-----Original Message-----" / "________________________________"
 *  - Generic: "From: " header after content started
 *  - Signature separator: exactly "--" on its own line
 *  - Lines starting with ">" (quoted text)
 */
function stripQuotedReply(text: string): string {
  let normalized = text.replace(/\r\n/g, '\n')

  // ── Pass 0: multi-line-safe truncation ──────────────────────────────────
  // Gmail WRAPS the attribution line ("Le mar. 14 juil. 2026 à 11:33, Ayoub
  // Hammoudi <xxx@gmail.com> a écrit :") across 2+ lines, defeating the
  // line-anchored patterns below (founder-reported, 2026-07-14). Cut the text
  // at the earliest attribution marker wherever it starts, even mid-paragraph.
  const attributionMarkers: RegExp[] = [
    /(^|\n)\s*On [\s\S]{5,200}?wrote\s*:/i,        // Gmail EN (possibly wrapped)
    /(^|\n)\s*Le [\s\S]{5,200}?a écrit\s*:/i,      // Gmail FR (possibly wrapped)
    /(^|\n)\s*-----Original Message-----/i,        // Outlook
    /(^|\n)\s*De\s?:\s.+\n\s*Envoyé\s?:/i,         // Outlook FR forwarded block
  ]
  let cutAt = -1
  for (const re of attributionMarkers) {
    const m = re.exec(normalized)
    if (m && (cutAt === -1 || m.index < cutAt)) cutAt = m.index
  }
  if (cutAt > 0) normalized = normalized.slice(0, cutAt)

  const lines      = normalized.split('\n')
  const kept: string[] = []
  let   seenContent    = false

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    // ── Hard stop markers ─────────────────────────────────────────────────
    // Email signature separator (exactly "--")
    if (trimmed === '--') break

    // Gmail "On ... wrote:" (any language variant)
    if (/^On .{5,120} wrote:\s*$/i.test(trimmed)) break

    // Gmail FR "Le ... a écrit :"
    if (/^Le .{5,120}(a écrit|écrit)\s*:?\s*$/i.test(trimmed)) break

    // Outlook / Thunderbird original-message separator
    if (trimmed === '-----Original Message-----') break
    if (/^_{10,}$/.test(trimmed)) break

    // "From:" line after real content has started (forwarded block)
    if (seenContent && /^From:\s+/i.test(trimmed)) break

    // ── Skip-only markers ─────────────────────────────────────────────────
    // Quoted lines ("> text")
    if (trimmed.startsWith('>')) continue

    // Unsubscribe / legal footer heuristic  (common in cold-email replies)
    if (/^(pour vous d[eé]sabonner|to unsubscribe|se d[eé]sabonner)/i.test(trimmed)) continue

    // Track first real content (ignore leading blank lines)
    if (trimmed.length > 0) seenContent = true

    kept.push(rawLine)
  }

  return kept.join('\n').trim()
}

// ─── Fallback helpers ─────────────────────────────────────────────────────────

/** True when text contains MIME boundary markers (--boundaryXXX) */
function hasMimeBoundary(text: string): boolean {
  return /^--[A-Za-z0-9]/m.test(text)
}

/**
 * Decodes Quoted-Printable encoding.
 *  - Removes soft line-breaks (=\n)
 *  - Decodes =XX hex sequences as UTF-8 bytes
 */
function decodeQP(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/((?:=[0-9A-Fa-f]{2})+)/g, (match) => {
      const bytes = match.split('=').filter(Boolean).map((h) => parseInt(h, 16))
      try   { return Buffer.from(bytes).toString('utf-8') }
      catch { return match }
    })
}

/** Strips HTML tags and decodes common HTML entities */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Legacy line-by-line cleaner (Strategy 2 fallback).
 * Strips SMTP headers, MIME boundary lines, and Content-* header lines.
 */
function legacyClean(text: string): string {
  const lines      = text.replace(/\r\n/g, '\n').split('\n')
  const kept: string[] = []
  let inHeaderBlock = /^[A-Za-z][A-Za-z0-9-]+: /.test(lines[0]?.trim() ?? '')

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    if (inHeaderBlock) {
      if (trimmed === '') inHeaderBlock = false
      continue
    }

    // Skip MIME boundary lines
    if (/^--[A-Za-z0-9]/.test(trimmed)) continue

    // Skip leaked MIME / transport headers
    if (/^(Content-Type|Content-Transfer-Encoding|MIME-Version|Content-Disposition):/i.test(trimmed)) continue

    kept.push(rawLine)
  }

  return kept.join('\n').trim()
}

/**
 * Strategy 3: brute-force parse when all else fails.
 * Separates MIME boundaries from adjacent content, QP-decodes, strips HTML.
 */
function bruteForceParse(raw: string): string {
  // Insert newline after any MIME boundary that is directly followed by content
  // e.g. "--000boundary\r\nHello" is fine; "--000boundaryHello" is the broken case
  const separated = raw.replace(/(--[A-Za-z0-9][^\r\n]*?)([A-Za-z<])/g, '$1\n$2')

  // Normalise line endings
  const normalised = separated.replace(/\r\n/g, '\n')

  // Strip RFC 2822 header block (before first blank line)
  const headerEnd = normalised.indexOf('\n\n')
  const body      = headerEnd !== -1 ? normalised.slice(headerEnd + 2) : normalised

  // Try to extract text/plain MIME part
  const plainIdx = body.search(/content-type:\s*text\/plain/i)
  if (plainIdx !== -1) {
    const partHeader     = body.slice(plainIdx, plainIdx + 400)
    const isQP           = /content-transfer-encoding:\s*quoted-printable/i.test(partHeader)
    const partBodyStart  = body.indexOf('\n\n', plainIdx)
    if (partBodyStart !== -1) {
      const content       = body.slice(partBodyStart + 2)
      const boundaryMatch = /\n--/.exec(content)
      const rawContent    = boundaryMatch ? content.slice(0, boundaryMatch.index) : content
      return isQP ? decodeQP(rawContent.trim()) : rawContent.trim()
    }
  }

  // No text/plain found: try HTML part
  const htmlIdx = body.search(/content-type:\s*text\/html/i)
  if (htmlIdx !== -1) {
    const partBodyStart = body.indexOf('\n\n', htmlIdx)
    if (partBodyStart !== -1) {
      const content       = body.slice(partBodyStart + 2)
      const boundaryMatch = /\n--/.exec(content)
      const rawHtml       = boundaryMatch ? content.slice(0, boundaryMatch.index) : content
      const partHeader    = body.slice(htmlIdx, htmlIdx + 400)
      const decoded       = /content-transfer-encoding:\s*quoted-printable/i.test(partHeader)
        ? decodeQP(rawHtml.trim())
        : rawHtml.trim()
      return stripHtml(decoded)
    }
  }

  // Total fallback: QP-decode + strip HTML from entire body
  return stripHtml(decodeQP(body))
}
