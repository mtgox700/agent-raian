/**
 * Inbox polling core: fetches new replies from every CONNECTED Gmail/Outlook
 * mailbox, classifies them, persists EmailReply + notifications.
 *
 * Extracted from /api/cron/poll-inboxes so it can run from BOTH:
 *  - the Vercel cron route (if the plan supports 5-min crons), and
 *  - the Inngest `inbox-poller` cron (primary: proven to fire in prod, unlike
 *    the Vercel crons which sat in an ignored vercel.json until 2026-07-13).
 * Idempotency (providerMessageId matching) makes double-running harmless.
 */

import { db } from '@/lib/db'
import { objectedLead } from '@/lib/privacy/opt-out'
import { decrypt } from '@/lib/security/crypto'
import { fetchGmailReplies, ensureValidToken } from '@/lib/email/gmail-client'
import { fetchOutlookReplies } from '@/lib/email/outlook-client'
import { classifyReply } from '@/lib/agents/reply-classifier'
import { createNotification, buildReplyNotification } from '@/lib/services/notifications.service'
import { extractEmailBody } from '@/lib/utils/email-parser'
import { fetchImapReplies, imapHostFromSmtp } from '@/lib/email/imap-client'
import { isBounceMessage, parseBounce } from '@/lib/email/bounce'
import { suppressEmails, type SuppressionDb } from '@/lib/deliverability/suppression'
import { SENT_STATUSES } from '@/lib/sequences/types'

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

export interface PollInboxesResult {
  elapsedMs:    number
  mailboxes:    number
  totalReplies: number
  totalErrors:  number
}

export async function pollInboxes(budgetMs = 50_000): Promise<PollInboxesResult> {
  const startedAt = Date.now()

  const mailboxes = await db.connectedMailbox.findMany({
    where:  { status: 'CONNECTED', provider: { in: ['GMAIL', 'OUTLOOK', 'SMTP'] } },
    select: {
      id: true, provider: true, email: true,
      accessTokenEnc: true, refreshTokenEnc: true, tokenExpiresAt: true,
      lastHistoryId: true, lastDeltaLink: true,
      smtpHost: true, smtpPasswordEnc: true, lastSyncAt: true,
      workspaceId: true,
    },
  })

  let totalReplies = 0
  let totalErrors  = 0

  for (const mailbox of mailboxes) {
    if (Date.now() - startedAt > budgetMs) break  // safety timeout

    try {
      const accessToken  = decrypt(mailbox.accessTokenEnc)
      const refreshToken = mailbox.refreshTokenEnc ? decrypt(mailbox.refreshTokenEnc) : null

      if (mailbox.provider === 'GMAIL') {
        const validToken = await ensureValidToken(
          mailbox.id, accessToken, refreshToken, mailbox.tokenExpiresAt,
        )

        const { replies, newHistoryId } = await fetchGmailReplies({
          accessToken:   validToken,
          refreshToken,
          mailboxId:     mailbox.id,
          lastHistoryId: mailbox.lastHistoryId,
        })

        for (const reply of replies) {
          await processReply({
            workspaceId:       mailbox.workspaceId,
            mailboxId:         mailbox.id,
            mailboxEmail:      mailbox.email,
            fromEmail:         reply.fromEmail,
            subject:           reply.subject,
            bodyText:          reply.bodyText,
            receivedAt:        reply.receivedAt,
            inReplyToHeader:   reply.inReplyToHeader,
            providerMessageId: reply.messageId,
            providerThreadId:  reply.threadId,
          })
          totalReplies++
        }

        await db.connectedMailbox.update({
          where: { id: mailbox.id },
          data:  { lastHistoryId: newHistoryId, lastSyncAt: new Date() },
        })

      } else if (mailbox.provider === 'OUTLOOK') {
        const { replies, newDeltaLink } = await fetchOutlookReplies({
          accessToken,
          refreshToken,
          mailboxId:     mailbox.id,
          lastDeltaLink: mailbox.lastDeltaLink,
        })

        for (const reply of replies) {
          await processReply({
            workspaceId:       mailbox.workspaceId,
            mailboxId:         mailbox.id,
            mailboxEmail:      mailbox.email,
            fromEmail:         reply.fromEmail,
            subject:           reply.subject,
            bodyText:          reply.bodyText,
            receivedAt:        reply.receivedAt,
            inReplyToHeader:   reply.inReplyToHeader,
            providerMessageId: reply.messageId,
          })
          totalReplies++
        }

        await db.connectedMailbox.update({
          where: { id: mailbox.id },
          data:  { lastDeltaLink: newDeltaLink, lastSyncAt: new Date() },
        })
      } else if (mailbox.provider === 'SMTP') {
        // Custom SMTP mailboxes (Infomaniak, OVH…): read replies over IMAP with
        // the same credentials. Without this, SMTP senders had no reply
        // detection and follow-ups kept going to leads who had answered.
        if (mailbox.smtpHost && mailbox.smtpPasswordEnc) {
          const since = mailbox.lastSyncAt
            ? new Date(mailbox.lastSyncAt.getTime() - 24 * 60 * 60 * 1000)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          const replies = await fetchImapReplies({
            host: imapHostFromSmtp(mailbox.smtpHost),
            user: mailbox.email,
            password: decrypt(mailbox.smtpPasswordEnc),
            since,
          })

          for (const reply of replies) {
            await processReply({
              workspaceId: mailbox.workspaceId,
              mailboxId: mailbox.id,
              mailboxEmail: mailbox.email,
              fromEmail: reply.fromEmail,
              subject: reply.subject,
              bodyText: reply.bodyText,
              receivedAt: reply.receivedAt,
              inReplyToHeader: reply.inReplyToHeader,
              providerMessageId: reply.messageId,
            })
            totalReplies++
          }

          await db.connectedMailbox.update({
            where: { id: mailbox.id },
            data: { lastSyncAt: new Date(), lastSyncError: null },
          })
        }
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[poll-inboxes] mailbox=${mailbox.id} error:`, msg)
      await db.connectedMailbox.update({
        where: { id: mailbox.id },
        data:  { lastSyncError: msg.slice(0, 500) },
      }).catch(() => null)
      totalErrors++
    }

    // Polite delay between mailboxes: respect Gmail 250 quota units/sec
    await sleep(200)
  }

  return {
    elapsedMs: Date.now() - startedAt,
    mailboxes: mailboxes.length,
    totalReplies,
    totalErrors,
  }
}

// ─── Delivery failures ───────────────────────────────────────────────────────

/**
 * A permanent delivery failure (hard bounce) suppresses the address in the
 * workspace and in the shared pool, and marks the last email sent to it as
 * BOUNCED. Temporary failures (mailbox full) are ignored: the address stays.
 */
async function processBounce(params: ReplyToProcess): Promise<boolean> {
  const bounce = parseBounce(params.bodyText, params.mailboxEmail)
  if (!bounce.recipient) return false
  if (!bounce.permanent) return true // temporary failure: nothing to do

  // The notice must concern an email this very mailbox sent.
  const lastSend = await db.emailSend.findFirst({
    where: {
      mailboxId: params.mailboxId,
      campaign:  { workspaceId: params.workspaceId },
      lead:     { email: { equals: bounce.recipient, mode: 'insensitive' } },
      status:    { in: [...SENT_STATUSES] },
    },
    orderBy: { sentAt: 'desc' },
    select:  { id: true },
  })
  if (!lastSend) return false

  await suppressEmails(db as unknown as SuppressionDb, params.workspaceId, [bounce.recipient], 'HARD_BOUNCE')
  await db.emailSend.update({
    where: { id: lastSend.id },
    data:  { status: 'BOUNCED', errorMessage: 'Hard bounce' },
  })
  console.info('[poll-inboxes] hard bounce', JSON.stringify({ emailSendId: lastSend.id }))
  return true
}

// ─── Core reply processing ────────────────────────────────────────────────────

interface ReplyToProcess {
  workspaceId:        string
  mailboxId:          string
  mailboxEmail:       string
  fromEmail:          string
  subject:            string
  bodyText:           string
  receivedAt:         Date
  inReplyToHeader:    string | null
  providerMessageId:  string
  providerThreadId?:  string | null
}

/** Longest body processed; also bounds every regex and LLM input below. */
const MAX_BODY_CHARS = 20_000

async function processReply(raw: ReplyToProcess): Promise<void> {
  const params = { ...raw, bodyText: raw.bodyText.slice(0, MAX_BODY_CHARS) }
  // A notice that is not a usable permanent failure follows the normal path.
  if (isBounceMessage(params.fromEmail, params.subject) && await processBounce(params)) return

  // Idempotency: skip if already processed via providerMessageId
  const alreadyProcessed = await db.emailReply.findFirst({
    where:  { emailSend: { providerMessageId: params.inReplyToHeader ?? params.providerMessageId } },
    select: { id: true },
  })
  if (alreadyProcessed) return

  // Find the EmailSend this is a reply to.
  // Matching strategy (in order of reliability):
  //   1. providerThreadId == reply.threadId  (most reliable for Gmail)
  //   2. providerMessageId == inReplyToHeader (works if RFC 2822 ID stored)
  //   3. resendMessageId   == inReplyToHeader (legacy Resend fallback)
  const emailSend = await db.emailSend.findFirst({
    where: {
      AND: [
        {
          OR: [
            ...(params.providerThreadId  ? [{ providerThreadId:  params.providerThreadId  }] : []),
            ...(params.inReplyToHeader   ? [{ providerMessageId: params.inReplyToHeader   }] : []),
            ...(params.providerMessageId ? [{ providerMessageId: params.providerMessageId }] : []),
            ...(params.inReplyToHeader   ? [{ resendMessageId:   params.inReplyToHeader   }] : []),
          ],
        },
        { campaign: { workspaceId: params.workspaceId } },
      ],
    },
    include: {
      lead:     true,
      campaign: {
        include: { workspace: { select: { owner: { select: { clerkId: true } } } } },
      },
    },
  })

  if (!emailSend) {
    // Not a reply to a Phantera-sent email: ignored, and nothing about it
    // (sender, subject, content) is logged: the privacy policy promises that
    // unrelated mailbox content is neither stored nor analysed.
    console.info('[poll-inboxes] NO_MATCH', JSON.stringify({
      workspaceId:  params.workspaceId,
      hasInReplyTo: Boolean(params.inReplyToHeader),
    }))
    return
  }

  console.info('[poll-inboxes] MATCHED', JSON.stringify({
    emailSendId: emailSend.id,
    leadId:      emailSend.leadId,
    campaignId:  emailSend.campaignId,
  }))

  const cleanBody = await extractEmailBody('', params.bodyText)
  const result    = await classifyReply(cleanBody || params.bodyText, params.subject)
  // Out-of-office: not an answer. Recording it would stop the sequence and
  // block the real reply that follows (one reply per send).
  if (result.isAutoReply) {
    console.info('[poll-inboxes] auto-reply ignored', JSON.stringify({ emailSendId: emailSend.id }))
    return
  }

  const now     = new Date()
  const snippet = (cleanBody || params.bodyText).slice(0, 160)

  const qualifiedAt = (result.classification === 'POSITIVE' || result.classification === 'MEETING_REQUEST') ? now : undefined
  const lostAt      = (result.classification === 'NEGATIVE' || result.classification === 'NOT_INTERESTED')  ? now : undefined

  await db.$transaction(async (tx) => {
    const existing = await tx.emailReply.findFirst({ where: { emailSendId: emailSend.id } })
    if (existing) return
    if (await objectedLead(tx, emailSend.leadId)) return

    await tx.emailReply.create({
      data: {
        emailSendId:    emailSend.id,
        campaignId:     emailSend.campaignId,
        leadId:         emailSend.leadId,
        receivedAt:     params.receivedAt,
        fromEmail:      params.fromEmail,
        bodyText:       cleanBody || params.bodyText,
        classification: result.dbClassification,
        confidence:     result.confidenceInt,
        // isProcessed is the inbox "read" flag: a new reply starts unread
        // (it was created read, so the Non lues filter never showed one).
        isProcessed:    false,
      },
    })

    if (result.classification !== 'NOT_INTERESTED') {
      await tx.campaign.update({
        where: { id: emailSend.campaignId },
        data:  { replyCount: { increment: 1 } },
      })
    }

    await tx.lead.update({
      where: { id: emailSend.leadId },
      data: {
        lastReplyAt:             now,
        lastReplyClassification: result.classification,
        lastReplySnippet:        snippet,
        doNotContact:            true,
        // Like the other reply handlers (mailbox sync, inbound email): a refusal is lost.
        ...(result.classification !== 'NEUTRAL'
          ? { status: result.classification === 'POSITIVE' || result.classification === 'MEETING_REQUEST' ? 'qualified' : 'lost' }
          : {}),
        ...(qualifiedAt ? { qualifiedAt } : {}),
        ...(lostAt      ? { lostAt }      : {}),
      },
    })
  })

  // Every human reply is notified, NEUTRAL included (unclear intent, or the
  // keyword fallback when the LLM was down): a hot reply is never lost.
  {
    const lead     = emailSend.lead
    const leadName = `${lead.firstName} ${lead.lastName}`

    void createNotification(
      buildReplyNotification({
        workspaceId:    params.workspaceId,
        leadName,
        company:        lead.company ?? null,
        classification: result.classification,
        leadId:         emailSend.leadId,
        campaignId:     emailSend.campaignId,
        campaignName:   emailSend.campaign.name,
      }),
    ).catch((err: unknown) => {
      console.error('[poll-inboxes] Failed to create notification:', err)
    })
  }
}
