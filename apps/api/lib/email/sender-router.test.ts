/**
 * Sender router — routing priority:
 *   1. Campaign-specific CONNECTED mailbox → provider client
 *   2. Workspace default CONNECTED mailbox → provider client
 *   3. No mailbox → Resend fallback
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  campaignFindUnique: vi.fn(),
  mailboxFindFirst:   vi.fn(),
  sendViaGmail:   vi.fn(),
  sendViaOutlook: vi.fn(),
  sendViaSmtp:    vi.fn(),
  sendViaResend:  vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    campaign:         { findUnique: mocks.campaignFindUnique },
    connectedMailbox: { findFirst: mocks.mailboxFindFirst },
  },
}))
vi.mock('@/lib/security/crypto', () => ({ decrypt: (s: string) => `decrypted:${s}` }))
vi.mock('./gmail-client', () => ({ sendViaGmail: mocks.sendViaGmail }))
vi.mock('./outlook-client', () => ({ sendViaOutlook: mocks.sendViaOutlook }))
vi.mock('./smtp-client', () => ({ sendViaSmtp: mocks.sendViaSmtp }))
vi.mock('@/lib/services/resend-client', () => ({ sendEmail: mocks.sendViaResend }))

import { routeSend } from './sender-router'

const baseParams = {
  workspaceId: 'ws_1',
  campaignId:  'c_1',
  to:          'lead@example.com',
  subject:     'Test',
  html:        '<p>Hello</p>',
  replyTo:     'reply+send_1@reply.phantera-tn.com',
}

const gmailMailbox = {
  id: 'mb_1', provider: 'GMAIL', email: 'user@gmail.com', displayName: 'User',
  accessTokenEnc: 'enc_token', refreshTokenEnc: 'enc_refresh', tokenExpiresAt: new Date(Date.now() + 3600_000),
  smtpHost: null, smtpPort: null, smtpSecure: true, smtpPasswordEnc: null,
  status: 'CONNECTED',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.sendViaGmail.mockResolvedValue({ messageId: 'g1', providerMessageId: 'g1', providerThreadId: 't1', provider: 'gmail' })
  mocks.sendViaOutlook.mockResolvedValue({ messageId: 'o1', providerMessageId: 'o1', providerThreadId: null, provider: 'outlook' })
  mocks.sendViaSmtp.mockResolvedValue({ messageId: '<s1@agency.fr>', providerMessageId: '<s1@agency.fr>', providerThreadId: null, provider: 'smtp' })
  mocks.sendViaResend.mockResolvedValue({ messageId: 'resend_1' })
})

describe('routeSend', () => {
  it('uses the campaign mailbox when connected', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailboxId: 'mb_1', fromAlias: null, connectedMailbox: gmailMailbox })

    const result = await routeSend(baseParams)

    expect(mocks.sendViaGmail).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ provider: 'gmail', providerMessageId: 'g1' })
  })

  it('falls back to the workspace default mailbox', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailbox: null })
    mocks.mailboxFindFirst.mockResolvedValueOnce(gmailMailbox)

    const result = await routeSend(baseParams)

    expect(mocks.sendViaGmail).toHaveBeenCalledTimes(1)
    expect(result.provider).toBe('gmail')
  })

  it('falls back to Resend when no mailbox exists, keeping the reply address', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailbox: null })
    mocks.mailboxFindFirst.mockResolvedValue(null)

    const result = await routeSend(baseParams)

    expect(mocks.sendViaResend).toHaveBeenCalledWith(expect.objectContaining({ replyTo: baseParams.replyTo }))
    expect(result).toMatchObject({ provider: 'resend', providerMessageId: null })
  })

  it('never sends a campaign tied to a disconnected mailbox from another sender', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailboxId: 'mb_1', fromAlias: null, connectedMailbox: { ...gmailMailbox, status: 'EXPIRED' } })
    mocks.mailboxFindFirst.mockResolvedValue({ ...gmailMailbox, id: 'mb_default', email: 'other@gmail.com' })

    await expect(routeSend(baseParams)).rejects.toThrow(/disconnected/)
    expect(mocks.sendViaGmail).not.toHaveBeenCalled()
    expect(mocks.sendViaResend).not.toHaveBeenCalled()
  })

  it('sends a Gmail campaign as its alias, with the alias display name', async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      connectedMailboxId: 'mb_1',
      fromAlias: 'sales@acme.fr',
      connectedMailbox: { ...gmailMailbox, sendAsAliases: [{ email: 'sales@acme.fr', displayName: 'Acme Sales', source: 'GMAIL' }] },
    })

    await routeSend(baseParams)

    expect(mocks.sendViaGmail).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: 'sales@acme.fr', fromName: 'Acme Sales', mailboxId: 'mb_1' }))
  })

  it('falls back to the mailbox address when the alias was removed', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailboxId: 'mb_1', fromAlias: 'gone@acme.fr', connectedMailbox: { ...gmailMailbox, sendAsAliases: [] } })

    await routeSend(baseParams)

    expect(mocks.sendViaGmail).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: 'user@gmail.com', fromName: 'User' }))
  })

  it('sends an SMTP alias from the account login, alias in From', async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      connectedMailboxId: 'mb_1',
      fromAlias: 'contact@agency.fr',
      connectedMailbox: {
        ...gmailMailbox, provider: 'SMTP', email: 'z@agency.fr', displayName: 'Zakaria',
        smtpHost: 'smtp.agency.fr', smtpPort: 465, smtpSecure: true, smtpPasswordEnc: 'enc_pw',
        sendAsAliases: [{ email: 'contact@agency.fr', displayName: null, source: 'MANUAL' }],
      },
    })

    await routeSend(baseParams)

    expect(mocks.sendViaSmtp).toHaveBeenCalledWith(expect.objectContaining({ user: 'z@agency.fr', fromEmail: 'contact@agency.fr', fromName: 'Zakaria' }))
  })

  it('a default mailbox never uses another campaign alias', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailboxId: null, fromAlias: null, connectedMailbox: null })
    mocks.mailboxFindFirst.mockResolvedValueOnce({ ...gmailMailbox, sendAsAliases: [{ email: 'sales@acme.fr', displayName: null, source: 'GMAIL' }] })

    await routeSend(baseParams)

    expect(mocks.sendViaGmail).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: 'user@gmail.com' }))
  })

  it('routes to Outlook', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailboxId: 'mb_1', fromAlias: 'ignored@acme.fr', connectedMailbox: { ...gmailMailbox, provider: 'OUTLOOK' } })

    const result = await routeSend(baseParams)

    expect(mocks.sendViaOutlook).toHaveBeenCalledTimes(1)
    expect(result.provider).toBe('outlook')
  })

  it('sends SMTP mail with the display name and without a third-party Reply-To', async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      connectedMailboxId: 'mb_1',
      fromAlias: null,
      connectedMailbox: {
        ...gmailMailbox, provider: 'SMTP', email: 'z@agency.fr', displayName: 'Zakaria',
        smtpHost: 'smtp.agency.fr', smtpPort: 465, smtpSecure: true, smtpPasswordEnc: 'enc_pw',
      },
    })

    const result = await routeSend(baseParams)

    expect(mocks.sendViaSmtp).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.agency.fr', port: 465, user: 'z@agency.fr', password: 'decrypted:enc_pw',
      fromName: 'Zakaria', replyTo: undefined,
    }))
    // The RFC 5322 Message-ID is what IMAP replies reference in In-Reply-To.
    expect(result.providerMessageId).toBe('<s1@agency.fr>')
  })

  it('never falls back to the shared domain when the customer mailbox fails', async () => {
    mocks.campaignFindUnique.mockResolvedValue({ connectedMailboxId: 'mb_1', fromAlias: null, connectedMailbox: gmailMailbox })
    mocks.sendViaGmail.mockRejectedValue(new Error('invalid_grant'))

    await expect(routeSend(baseParams)).rejects.toThrow(/GMAIL send failed: invalid_grant/)
    expect(mocks.sendViaResend).not.toHaveBeenCalled()
  })
})
