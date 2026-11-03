/**
 * Tests for the inbound email parser.
 *
 * Coverage targets:
 *   • Strategy 1 — mailparser on a well-formed multipart MIME email
 *   • Strategy 2 — pre-parsed text field fallback
 *   • Strategy 3 — brute-force MIME parse when raw is malformed
 *   • stripQuotedReply across Gmail / Gmail-FR / Outlook patterns
 *   • Quoted-printable decoding (é, ç, etc.)
 *   • Edge cases: empty input, HTML only, length cap at 600 chars
 */
import { describe, expect, it } from 'vitest'
import { extractEmailBody } from './email-parser'

// ─── Test fixtures (raw RFC 2822 emails) ─────────────────────────────────────

const VALID_MULTIPART_EMAIL = [
  'From: lead@example.com',
  'To: reply+abc123@phantera-tn.com',
  'Subject: Re: Your product',
  'Content-Type: multipart/alternative; boundary="boundary42"',
  '',
  '--boundary42',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: 7bit',
  '',
  'Bonjour, je suis intéressé. On peut prévoir un call ?',
  '',
  '--boundary42',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: 7bit',
  '',
  '<div>Bonjour, je suis intéressé. On peut prévoir un call ?</div>',
  '',
  '--boundary42--',
  '',
].join('\r\n')

const EMAIL_WITH_GMAIL_QUOTE = [
  'From: lead@example.com',
  'To: reply+abc123@phantera-tn.com',
  'Subject: Re: Your product',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Yes that sounds great, let me know your availability.',
  '',
  'On Mon, Apr 21, 2026 at 10:00 AM Phantera <hello@phantera-tn.com> wrote:',
  '> Hi there, would you like to schedule a demo?',
  '> Best regards,',
  '> The team',
  '',
].join('\r\n')

const EMAIL_FRENCH_QUOTE = [
  'From: lead@example.com',
  'To: reply+abc123@phantera-tn.com',
  'Subject: Re: Demo',
  'Content-Type: text/plain; charset=utf-8',
  '',
  "Ça m'intéresse, on peut programmer un appel ?",
  '',
  'Le lun. 21 avr. 2026 à 10:00, Phantera <hello@phantera-tn.com> a écrit :',
  "> Bonjour, souhaitez-vous voir une démo ?",
  '',
].join('\r\n')

const EMAIL_OUTLOOK_QUOTE = [
  'From: lead@example.com',
  'To: reply+abc123@phantera-tn.com',
  'Subject: Re: Demo',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Interested, please send me more info.',
  '',
  '-----Original Message-----',
  'From: Phantera <hello@phantera-tn.com>',
  'Subject: Demo',
  '',
  'Would you like a demo?',
  '',
].join('\r\n')

const EMAIL_QUOTED_PRINTABLE = [
  'From: lead@example.com',
  'To: reply+abc123@phantera-tn.com',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Bonjour, =C3=A7a m=27int=C3=A9resse beaucoup.',
  '',
].join('\r\n')

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('extractEmailBody — Strategy 1 (mailparser)', () => {
  it('extracts the text/plain part from a well-formed multipart email', async () => {
    const result = await extractEmailBody(VALID_MULTIPART_EMAIL)
    expect(result).toContain('Bonjour')
    expect(result).toContain('intéressé')
    expect(result).not.toContain('--boundary42')
    expect(result).not.toContain('Content-Type')
    expect(result).not.toContain('<div>')
  })

  it('decodes UTF-8 characters correctly', async () => {
    const result = await extractEmailBody(VALID_MULTIPART_EMAIL)
    expect(result).toMatch(/intéressé/) // é preserved
  })

  it('strips Gmail "On … wrote:" quoted thread', async () => {
    const result = await extractEmailBody(EMAIL_WITH_GMAIL_QUOTE)
    expect(result).toContain('Yes that sounds great')
    expect(result).not.toContain('> Hi there')
    expect(result).not.toContain('would you like to schedule')
    expect(result).not.toMatch(/On Mon, Apr 21/)
  })

  it('strips French Gmail "Le … a écrit :" quoted thread', async () => {
    const result = await extractEmailBody(EMAIL_FRENCH_QUOTE)
    expect(result).toMatch(/intéresse/)
    expect(result).not.toContain('> Bonjour, souhaitez-vous')
    expect(result).not.toContain('a écrit')
  })

  it('strips Outlook "-----Original Message-----" thread', async () => {
    const result = await extractEmailBody(EMAIL_OUTLOOK_QUOTE)
    expect(result).toContain('Interested, please send me more info')
    expect(result).not.toContain('Original Message')
    expect(result).not.toContain('Would you like a demo')
  })

  it('decodes quoted-printable encoded characters', async () => {
    const result = await extractEmailBody(EMAIL_QUOTED_PRINTABLE)
    expect(result).toMatch(/intéresse/)
    expect(result).not.toContain('=C3=A9')
    expect(result).not.toContain('=C3=A7')
  })
})

describe('extractEmailBody — Strategy 2 (text field fallback)', () => {
  it('uses pre-parsed text when raw is empty but text is clean', async () => {
    const cleanText = 'Hello, this is a clean reply with no MIME stuff.'
    const result = await extractEmailBody('', cleanText)
    expect(result).toBe(cleanText)
  })

  it('strips MIME boundary lines from pre-parsed text', async () => {
    // Strategy 2's legacyClean removes lines starting with --boundaryXX,
    // leaving only the actual content.
    const dirtyText = '--boundary123\nSome content\n--boundary123'
    const result = await extractEmailBody('', dirtyText)
    expect(result).toBe('Some content')
    expect(result).not.toContain('--boundary')
  })

  it('ignores undefined text and parses raw instead', async () => {
    const result = await extractEmailBody(VALID_MULTIPART_EMAIL)
    expect(result).toContain('Bonjour')
  })
})

describe('extractEmailBody — Strategy 3 (brute-force fallback)', () => {
  it('handles malformed MIME (boundary glued to content)', async () => {
    // Simulates the Cloudflare worker bug: no \r\n between boundary and content
    const malformed = [
      'From: lead@example.com',
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1Content-Type: text/plain',
      '',
      'Recovered text from broken MIME.',
      '--b1--',
    ].join('\n')
    const result = await extractEmailBody(malformed)
    expect(result.length).toBeGreaterThan(0)
  })

  it('strips HTML tags as last resort', async () => {
    const htmlOnly = [
      'From: lead@example.com',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<html><body><p>This is <strong>important</strong>.</p></body></html>',
    ].join('\r\n')
    const result = await extractEmailBody(htmlOnly)
    expect(result).toContain('important')
    expect(result).not.toContain('<p>')
    expect(result).not.toContain('<strong>')
  })
})

describe('extractEmailBody — Strategy 2 header block stripping', () => {
  it('strips RFC 2822 header block from pre-parsed text before content', async () => {
    // text starts with header-like lines, blank line, then content
    const textWithHeaders = [
      'From: sender@example.com',
      'To: reply+x@phantera-tn.com',
      'Subject: Re: Test',
      'Date: Mon, 1 Jan 2026 00:00:00 +0000',
      '',
      'This is the real reply content.',
    ].join('\n')

    const result = await extractEmailBody('', textWithHeaders)
    expect(result).toContain('real reply content')
    expect(result).not.toContain('From:')
    expect(result).not.toContain('Subject:')
  })
})

describe('extractEmailBody — Strategy 3 HTML-only fallback', () => {
  it('extracts text from text/html MIME part when text/plain absent', async () => {
    // Forces brute-force parse: malformed multipart with only HTML part
    const htmlOnlyMultipart = [
      'From: lead@example.com',
      'Content-Type: multipart/alternative; boundary="x"',
      '',
      '--xContent-Type: text/html; charset=utf-8',
      '',
      '<p>HTML-only reply content here.</p>',
      '--x--',
    ].join('\n')

    const result = await extractEmailBody(htmlOnlyMultipart)
    // Brute-force should strip the HTML tags and return text
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toContain('<p>')
  })

  it('handles quoted-printable inside HTML MIME part', async () => {
    const qpHtml = [
      'From: lead@example.com',
      'Content-Type: multipart/alternative; boundary="z"',
      '',
      '--zContent-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>Bonjour =C3=A7a va ?</p>',
      '--z--',
    ].join('\n')

    const result = await extractEmailBody(qpHtml)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('extractEmailBody — edge cases', () => {
  it('returns empty string when both raw and text are empty', async () => {
    expect(await extractEmailBody('')).toBe('')
    expect(await extractEmailBody('', '')).toBe('')
  })

  it('caps output at 600 characters', async () => {
    const longContent = 'x '.repeat(2000) // 4000 chars
    const longEmail = [
      'From: lead@example.com',
      'Content-Type: text/plain; charset=utf-8',
      '',
      longContent,
    ].join('\r\n')

    const result = await extractEmailBody(longEmail)
    expect(result.length).toBeLessThanOrEqual(600)
  })

  it('strips email signature separator "--" on its own line', async () => {
    const withSignature = [
      'From: lead@example.com',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Real content here.',
      '',
      '--',
      'John Doe',
      'CEO, Acme Corp',
      'john@example.com',
    ].join('\r\n')

    const result = await extractEmailBody(withSignature)
    expect(result).toContain('Real content')
    expect(result).not.toContain('John Doe')
    expect(result).not.toContain('CEO, Acme Corp')
  })

  it('removes lines starting with ">" (quoted content)', async () => {
    const withQuoted = [
      'From: lead@example.com',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'My fresh response here.',
      '> Original message line 1',
      '> Original message line 2',
    ].join('\r\n')

    const result = await extractEmailBody(withQuoted)
    expect(result).toContain('fresh response')
    expect(result).not.toContain('> Original')
    expect(result).not.toContain('Original message')
  })
})
