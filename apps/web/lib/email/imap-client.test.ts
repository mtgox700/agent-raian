import { describe, it, expect, vi } from 'vitest'
import { parseFetchLines, extractText, imapDate, imapHostFromSmtp } from './imap-client'

// readLine() inlines each IMAP literal as a JSON string, so a FETCH response
// reaches the parser as a single line like the ones built here.
function fetchLine(seq: number, headers: string, body: string, internal = '06-Oct-2026 10:15:00 +0200'): string {
  return `* ${seq} FETCH (UID ${100 + seq} INTERNALDATE "${internal}" BODY[HEADER] ${JSON.stringify(headers)} BODY[TEXT]<0> ${JSON.stringify(body)})`
}

const REPLY_HEADERS = [
  'From: Jeanne Martin <Jeanne.Martin@client.fr>',
  'Subject: =?UTF-8?B?UmU6IFZvdHJlIHByb3NwZWN0aW9u?=',
  'Message-ID: <reply-1@client.fr>',
  'In-Reply-To: <step1-abc@phantera.test>',
  'Content-Type: text/plain; charset=utf-8',
  '',
].join('\r\n')

describe('parseFetchLines', () => {
  it('returns a reply with the In-Reply-To id used to match the EmailSend', () => {
    const [reply] = parseFetchLines([fetchLine(1, REPLY_HEADERS, 'Oui, appelons-nous jeudi.')], 'me@agency.fr')
    expect(reply.inReplyToHeader).toBe('<step1-abc@phantera.test>')
    expect(reply.messageId).toBe('<reply-1@client.fr>')
    expect(reply.fromEmail).toBe('jeanne.martin@client.fr')
    expect(reply.subject).toBe('Re: Votre prospection')
    expect(reply.bodyText).toBe('Oui, appelons-nous jeudi.')
    expect(reply.receivedAt.toISOString()).toBe('2026-10-06T08:15:00.000Z')
  })

  it('falls back to the last References id when In-Reply-To is absent', () => {
    const headers = 'From: a@b.fr\r\nReferences: <step1@x> <step2@x>\r\nMessage-ID: <r@b.fr>\r\n'
    const [reply] = parseFetchLines([fetchLine(1, headers, 'ok')], 'me@agency.fr')
    expect(reply.inReplyToHeader).toBe('<step2@x>')
  })

  it('ignores messages that are not replies', () => {
    const headers = 'From: news@shop.fr\r\nSubject: Promo\r\nMessage-ID: <n@shop.fr>\r\n'
    expect(parseFetchLines([fetchLine(1, headers, 'promo')], 'me@agency.fr')).toEqual([])
  })

  it('ignores untagged lines that are not FETCH responses', () => {
    expect(parseFetchLines(['* OK still here', '* 3 EXISTS'], 'me@agency.fr')).toEqual([])
  })

  it('skips one malformed message without losing the others', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = '* 1 FETCH (UID 101 BODY[HEADER] "unterminated \\q" BODY[TEXT]<0> "x")'
    const replies = parseFetchLines([broken, fetchLine(2, REPLY_HEADERS, 'Intéressé')], 'me@agency.fr')
    expect(replies).toHaveLength(1)
    expect(replies[0].bodyText).toBe('Intéressé')
    warn.mockRestore()
  })

  it('builds a stable id when the reply has no Message-ID', () => {
    const headers = 'From: a@b.fr\r\nIn-Reply-To: <s@x>\r\n'
    const line = fetchLine(1, headers, 'ok', '06-Oct-2026 10:15:00 +0200')
    const first = parseFetchLines([line], 'me@agency.fr')[0].messageId
    const second = parseFetchLines([line], 'me@agency.fr')[0].messageId
    expect(first).toBe(second)
  })

  it('does not produce an invalid date from a garbled INTERNALDATE', () => {
    const [reply] = parseFetchLines([fetchLine(1, REPLY_HEADERS, 'ok', 'garbage')], 'me@agency.fr')
    expect(Number.isNaN(reply.receivedAt.getTime())).toBe(false)
  })
})

describe('extractText', () => {
  it('prefers the text/plain part of a multipart message and decodes base64', () => {
    const body = [
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('Bonjour, avec plaisir.').toString('base64'),
      '--b1',
      'Content-Type: text/html',
      '',
      '<p>ignored</p>',
      '--b1--',
    ].join('\r\n')
    expect(extractText({ 'content-type': 'multipart/alternative; boundary="b1"' }, body)).toBe('Bonjour, avec plaisir.')
  })

  it('falls back to stripped HTML when there is no text part', () => {
    const body = '--b2\r\nContent-Type: text/html\r\n\r\n<p>Pas int&eacute;ress&eacute;</p><br>Merci\r\n--b2--'
    expect(extractText({ 'content-type': 'multipart/alternative; boundary=b2' }, body)).toContain('Merci')
  })

  it('decodes quoted-printable accents', () => {
    expect(extractText({ 'content-transfer-encoding': 'quoted-printable' }, 'Int=C3=A9ress=C3=A9')).toBe('Intéressé')
  })
})

describe('helpers', () => {
  it('formats IMAP SINCE dates', () => {
    expect(imapDate(new Date('2026-10-06T23:30:00Z'))).toBe('06-Oct-2026')
  })

  it('derives the IMAP host from the SMTP host', () => {
    expect(imapHostFromSmtp('smtp.infomaniak.com')).toBe('imap.infomaniak.com')
    expect(imapHostFromSmtp('mail.ovh.net')).toBe('mail.ovh.net')
  })
})

describe('fetchImapReplies input safety', () => {
  it('refuses credentials that would inject IMAP commands, before any network access', async () => {
    const { fetchImapReplies } = await import('./imap-client')
    await expect(fetchImapReplies({
      host: 'imap.example.fr', user: 'me@agency.fr', password: 'pw\r\nA9 DELETE INBOX', since: new Date(),
    })).rejects.toThrow(/forbidden control characters/)
  })

  it('refuses a host that resolves to a private address', async () => {
    const { fetchImapReplies } = await import('./imap-client')
    await expect(fetchImapReplies({
      host: '127.0.0.1', user: 'me@agency.fr', password: 'pw', since: new Date(),
    })).rejects.toThrow(/non-public/)
  })
})
