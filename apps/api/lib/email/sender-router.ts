/**
 * Phantera: Sender Router
 *
 * Single entry point for all outbound emails in campaign sequences.
 * Routing priority:
 *   1. ConnectedMailbox attached to the campaign (Gmail / Outlook / SMTP)
 *   2. Default ConnectedMailbox for the workspace
 *   3. No mailbox at all: Resend (Phantera shared domain). A connected
 *      mailbox that fails never falls back to Resend.
 *
 * Returns a unified SendResult regardless of the underlying provider,
 * including providerMessageId and providerThreadId when available
 * (needed for inbox reply matching).
 */

import { db } from '@/lib/db'
import { brand } from '@/lib/brand'
import { decrypt } from '@/lib/security/crypto'
import { sendViaGmail } from './gmail-client'
import { sendViaOutlook } from './outlook-client'
import { sendViaSmtp } from './smtp-client'
import { sendEmail as sendViaResend } from '@/lib/services/resend-client'
import { senderAddress } from './sender-identity'
import { senderServes } from '@/lib/auth/scope'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutedSendParams {
  workspaceId:        string
  campaignId:         string
  to:                 string
  subject:            string
  html:               string
  replyTo?:           string
  listUnsubscribeUrl?: string
  tags?:              Array<{ name: string; value: string }>
}

export interface RoutedSendResult {
  messageId:         string
  providerMessageId: string | null  // Gmail/Outlook native ID for reply matching
  providerThreadId:  string | null  // Gmail thread ID
  provider:          'gmail' | 'outlook' | 'smtp' | 'resend'
  /** Connected mailbox that sent the email; null for the Resend fallback. */
  mailboxId:         string | null
}

/** What a provider client returns; the router adds the sending mailbox. */
export type ProviderSendResult = Omit<RoutedSendResult, 'mailboxId'>

// ─── Resend fallback helper ──────────────────────────────────────────────────

async function fallbackResend(params: RoutedSendParams): Promise<RoutedSendResult> {
  const result = await sendViaResend({
    to:                 params.to,
    from:               process.env.RESEND_FROM_EMAIL ?? `${brand.name} <outreach@${brand.domain}>`,
    subject:            params.subject,
    html:               params.html,
    replyTo:            params.replyTo,
    listUnsubscribeUrl: params.listUnsubscribeUrl,
    tags:               params.tags,
  })
  return {
    messageId:         result.messageId,
    providerMessageId: null,
    providerThreadId:  null,
    provider:          'resend',
    mailboxId:         null,
  }
}

function withMailbox(
  mailboxId: string,
  result: ProviderSendResult,
): RoutedSendResult {
  return { ...result, mailboxId }
}

// ─── Main router ──────────────────────────────────────────────────────────────

export async function routeSend(
  params: RoutedSendParams,
  resolved?: SendingMailbox | null,
): Promise<RoutedSendResult> {
  const mailbox = resolved === undefined
    ? await resolveSendingMailbox(params.workspaceId, params.campaignId)
    : resolved

  // Structured log: visible in Vercel logs. Tells us EXACTLY which sender was picked.
  console.info('[sender-router]', JSON.stringify({
    workspaceId: params.workspaceId,
    campaignId:  params.campaignId,
    to:          params.to,
    resolved:    mailbox
      ? { provider: mailbox.provider, email: mailbox.email, status: mailbox.status, id: mailbox.id }
      : 'NO_MAILBOX_FOUND -> fallback Resend',
  }))

  if (!mailbox) {
    // A campaign tied to its own mailbox never goes out from another sender
    // (send-step holds it; this guards any other caller).
    if (resolved === undefined) {
      const own = await db.campaign.findUnique({ where: { id: params.campaignId }, select: { connectedMailboxId: true } })
      if (own?.connectedMailboxId) throw new Error('Campaign mailbox disconnected: not sending from another address')
    }
    return fallbackResend(params)
  }

  const accessToken = decrypt(mailbox.accessTokenEnc)
  // The campaign's alias when it is still one of the mailbox's aliases,
  // otherwise the mailbox's own address: never an address the user lost.
  const from = senderAddress(mailbox, mailbox.fromAlias)
  if (!from.asRequested) {
    console.warn(`[sender-router] alias ${mailbox.fromAlias} no longer usable on mailbox ${mailbox.id}: sending as ${mailbox.email}`)
  }

  // A failing mailbox never falls back to Resend: the prospect would receive
  // the email from another sender on the shared Phantera domain, and that
  // domain's reputation would be burnt by every customer's failures. The
  // error propagates so send-step records the failure and retries later.
  try {
    switch (mailbox.provider) {
      case 'GMAIL':
        return withMailbox(mailbox.id, await sendViaGmail({
          accessToken,
          refreshToken:       mailbox.refreshTokenEnc ? decrypt(mailbox.refreshTokenEnc) : null,
          mailboxId:          mailbox.id,
          fromEmail:          from.email,
          fromName:           from.name ?? undefined,
          to:                 params.to,
          subject:            params.subject,
          html:               params.html,
          listUnsubscribeUrl: params.listUnsubscribeUrl,
        }))

      case 'OUTLOOK':
        return withMailbox(mailbox.id, await sendViaOutlook({
          accessToken,
          refreshToken:       mailbox.refreshTokenEnc ? decrypt(mailbox.refreshTokenEnc) : null,
          mailboxId:          mailbox.id,
          fromEmail:          mailbox.email,
          to:                 params.to,
          subject:            params.subject,
          html:               params.html,
          listUnsubscribeUrl: params.listUnsubscribeUrl,
        }))

      case 'SMTP':
        return withMailbox(mailbox.id, await sendViaSmtp({
          host:               mailbox.smtpHost!,
          port:               mailbox.smtpPort ?? 587,
          secure:             mailbox.smtpSecure,
          user:               mailbox.email,
          fromEmail:          from.email,
          password:           mailbox.smtpPasswordEnc ? decrypt(mailbox.smtpPasswordEnc) : '',
          to:                 params.to,
          subject:            params.subject,
          html:               params.html,
          listUnsubscribeUrl: params.listUnsubscribeUrl,
          // Display name from the connected mailbox ("Zakaria KHCHICHE <z@domain>").
          fromName:           from.name,
          // No third-party Reply-To on SMTP sends: a Reply-To on another domain
          // (reply+…@phantera-tn.com) made outbound mail silently disappear after
          // #22 (accepted by the SMTP server, never delivered: even to the
          // sender's own domain). Replies now go straight to the mailbox itself.
          // Replies are detected by IMAP polling (lib/email/poll-inboxes).
          replyTo:            undefined,
        }))

      default:
        throw new Error(`Unknown mailbox provider: ${(mailbox as { provider: string }).provider}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[sender-router] ${mailbox.provider} send failed for mailbox ${mailbox.id}: ${msg}`)
    throw new Error(`${mailbox.provider} send failed: ${msg}`)
  }
}

// ─── Mailbox resolution ───────────────────────────────────────────────────────

const MAILBOX_SELECT = {
  id: true, provider: true, email: true, displayName: true,
  accessTokenEnc: true, refreshTokenEnc: true, tokenExpiresAt: true,
  smtpHost: true, smtpPort: true, smtpSecure: true, smtpPasswordEnc: true,
  status: true, createdAt: true,
  dailyCap: true, warmupEnabled: true, sendPausedUntil: true,
  sendAsAliases: true,
} as const

/**
 * The mailbox a campaign email would be sent from: the campaign's own mailbox
 * (with its alias), else the workspace default, else any connected one. Only
 * mailboxes that serve the campaign's owner count: their own, or one an admin
 * shared with the team. Null means the Resend shared-domain fallback: or,
 * when the campaign has its own mailbox and it is disconnected or no longer
 * shared, that the send must wait: a campaign the user tied to one address
 * never goes out from another.
 */
export async function resolveSendingMailbox(workspaceId: string, campaignId: string) {
  // 1. Campaign-specific mailbox
  const campaign = await db.campaign.findUnique({
    where:  { id: campaignId },
    select: {
      ownerUserId: true, connectedMailboxId: true, fromAlias: true,
      connectedMailbox: { select: { ...MAILBOX_SELECT, ownerUserId: true, sharedWithTeam: true } },
    },
  })
  if (!campaign) return null

  if (campaign.connectedMailboxId) {
    const own = campaign.connectedMailbox
    if (!own || own.status !== 'CONNECTED' || !senderServes(own, campaign.ownerUserId)) return null
    const { ownerUserId: _owner, sharedWithTeam: _shared, ...mailbox } = own
    return { ...mailbox, fromAlias: campaign.fromAlias }
  }

  const serving = { workspaceId, status: 'CONNECTED' as const, OR: [{ ownerUserId: campaign.ownerUserId }, { sharedWithTeam: true }] }

  // 2. Default mailbox (each member picks theirs; their own before a shared one)
  const defaultMailbox = await db.connectedMailbox.findFirst({
    where:   { ...serving, isDefault: true },
    orderBy: { sharedWithTeam: 'asc' },
    select:  MAILBOX_SELECT,
  })
  if (defaultMailbox) return { ...defaultMailbox, fromAlias: null }

  // 3. Any connected mailbox serving this campaign, the owner's own first
  const any = await db.connectedMailbox.findFirst({
    where:   serving,
    orderBy: { sharedWithTeam: 'asc' },
    select:  MAILBOX_SELECT,
  })
  return any ? { ...any, fromAlias: null } : null
}

export type SendingMailbox = NonNullable<Awaited<ReturnType<typeof resolveSendingMailbox>>>
