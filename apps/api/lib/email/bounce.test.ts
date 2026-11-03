import { describe, expect, it } from 'vitest'
import { parseBounce, isBounceMessage } from './bounce'

describe('isBounceMessage', () => {
  it.each([
    ['mailer-daemon@googlemail.com', 'Delivery Status Notification (Failure)'],
    ['postmaster@outlook.com', 'Undeliverable: Question rapide'],
    ['mailer-daemon@googlemail.com', 'Delivery Status Notification (Delay)'],
    ['MAILER-DAEMON@mail.infomaniak.com', 'Mail delivery failed: returning message to sender'],
    ['postmaster@ovh.net', 'Non remis : Question rapide'],
  ])('recognises %s / %s', (from, subject) => {
    expect(isBounceMessage(from, subject)).toBe(true)
  })

  it('does not treat a human reply as a bounce', () => {
    expect(isBounceMessage('jeanne@client.fr', 'Re: Question rapide')).toBe(false)
  })

  it('needs both a mail-system sender and a notice subject', () => {
    expect(isBounceMessage('postmaster@petite-societe.fr', 'Re: Question rapide')).toBe(false)
    expect(isBounceMessage('jeanne@client.fr', 'Re: colis undelivered')).toBe(false)
  })
})

describe('parseBounce', () => {
  it('reads the failed recipient and a permanent failure from a DSN', () => {
    const body = 'Reporting-MTA: dns; mx.google.com\nFinal-Recipient: rfc822; ghost@client.fr\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 user unknown'
    expect(parseBounce(body, 'me@agency.fr')).toEqual({ recipient: 'ghost@client.fr', permanent: true })
  })

  it('reads the Gmail human-readable format', () => {
    const body = "Address not found\nYour message wasn't delivered to ghost@client.fr because the address couldn't be found."
    expect(parseBounce(body, 'me@agency.fr')).toEqual({ recipient: 'ghost@client.fr', permanent: true })
  })

  it('reads the Outlook format', () => {
    const body = 'Delivery has failed to these recipients or groups:\nghost@client.fr\nThe email address you entered couldn\'t be found.'
    expect(parseBounce(body, 'me@agency.fr')).toMatchObject({ recipient: 'ghost@client.fr', permanent: true })
  })

  it('treats a full mailbox (4.x.x) as temporary', () => {
    const body = 'Final-Recipient: rfc822; busy@client.fr\nAction: delayed\nStatus: 4.2.2\nDiagnostic-Code: smtp; 452 mailbox full'
    expect(parseBounce(body, 'me@agency.fr')).toEqual({ recipient: 'busy@client.fr', permanent: false })
  })

  it('never returns the sender itself as the failed recipient', () => {
    const body = 'This message was created automatically by mail delivery software. me@agency.fr could not deliver.'
    expect(parseBounce(body, 'me@agency.fr').recipient).toBeNull()
  })

  it('never picks an address merely quoted in the body', () => {
    const body = 'The email address you entered does not exist.\nContact support@provider.com for help.'
    expect(parseBounce(body, 'me@agency.fr').recipient).toBeNull()
  })

  it('does not read a price or a phone number as an SMTP 550 code', () => {
    const body = 'Final-Recipient: rfc822; jeanne@client.fr\nNotre offre à 550 euros'
    expect(parseBounce(body, 'me@agency.fr').permanent).toBe(false)
  })

  it('stays fast on a huge body without any address (no catastrophic backtracking)', () => {
    const started = Date.now()
    parseBounce('a'.repeat(200_000), 'me@agency.fr')
    expect(Date.now() - started).toBeLessThan(500)
  })
})
