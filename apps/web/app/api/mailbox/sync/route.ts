/**
 * POST /api/mailbox/sync
 *
 * Manually triggers a poll of the user's connected mailboxes for new replies.
 * Used:
 *   - In local dev (no Vercel cron)
 *   - On-demand from the UI "Sync now" button
 *
 * Authenticated via Clerk (not CRON_SECRET) so users can only sync their own mailboxes.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { objectedLead } from '@/lib/privacy/opt-out'
import { decrypt } from '@/lib/security/crypto'
import { fetchGmailReplies, ensureValidToken } from '@/lib/email/gmail-client'
import { fetchOutlookReplies } from '@/lib/email/outlook-client'
import { classifyReply } from '@/lib/agents/reply-classifier'
import { createNotification, buildReplyNotification } from '@/lib/services/notifications.service'
import { extractEmailBody } from '@/lib/utils/email-parser'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { ownMailboxScope } from '@/lib/auth/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface SyncResult {
  mailboxEmail: string
  provider:     string
  repliesFound: number
  error?:       string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; resetHistory?: boolean }
  if (!body.workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  // Access first: nothing below may touch a workspace the caller does not belong to.
  const access = await requireAccess(userId, 'inbox.write', { workspaceId: body.workspaceId })
  if (!access.ok) return accessDenied(access)

  // If resetHistory is true, clear lastHistoryId / lastDeltaLink so the next poll
  // re-fetches the last 48 hours of inbox messages. Used to rescue past replies
  // that were missed because of a previous bug.
  if (body.resetHistory) {
    await db.connectedMailbox.updateMany({
      where: ownMailboxScope(access.ctx),
      data:  { lastHistoryId: null, lastDeltaLink: null },
    })
  }

  // A member syncs their own mailboxes; admins every mailbox of the workspace.
  const mailboxes = await db.connectedMailbox.findMany({
    where:  { ...ownMailboxScope(access.ctx), status: 'CONNECTED', provider: { in: ['GMAIL', 'OUTLOOK'] } },
    select: {
      id: true, provider: true, email: true,
      accessTokenEnc: true, refreshTokenEnc: true, tokenExpiresAt: true,
      lastHistoryId: true, lastDeltaLink: true, workspaceId: true,
    },
  })

  const results: SyncResult[] = []
  let totalReplies = 0

  for (const mb of mailboxes) {
    try {
      const accessToken  = decrypt(mb.accessTokenEnc)
      const refreshToken = mb.refreshTokenEnc ? decrypt(mb.refreshTokenEnc) : null

      let count = 0

      if (mb.provider === 'GMAIL') {
        const validToken = await ensureValidToken(mb.id, accessToken, refreshToken, mb.tokenExpiresAt)
        const { replies, newHistoryId } = await fetchGmailReplies({
          accessToken: validToken,
          refreshToken,
          mailboxId:   mb.id,
          lastHistoryId: mb.lastHistoryId,
        })

        for (const reply of replies) {
          const processed = await processReply({
            workspaceId:       mb.workspaceId,
            fromEmail:         reply.fromEmail,
            subject:           reply.subject,
            bodyText:          reply.bodyText,
            receivedAt:        reply.receivedAt,
            inReplyToHeader:   reply.inReplyToHeader,
            providerMessageId: reply.messageId,
            providerThreadId:  reply.threadId,
          })
          if (processed) count++
        }

        await db.connectedMailbox.update({
          where: { id: mb.id },
          data:  { lastHistoryId: newHistoryId, lastSyncAt: new Date(), lastSyncError: null },
        })

      } else if (mb.provider === 'OUTLOOK') {
        const { replies, newDeltaLink } = await fetchOutlookReplies({
          accessToken, refreshToken, mailboxId: mb.id, lastDeltaLink: mb.lastDeltaLink,
        })

        for (const reply of replies) {
          const processed = await processReply({
            workspaceId:       mb.workspaceId,
            fromEmail:         reply.fromEmail,
            subject:           reply.subject,
            bodyText:          reply.bodyText,
            receivedAt:        reply.receivedAt,
            inReplyToHeader:   reply.inReplyToHeader,
            providerMessageId: reply.messageId,
          })
          if (processed) count++
        }

        await db.connectedMailbox.update({
          where: { id: mb.id },
          data:  { lastDeltaLink: newDeltaLink, lastSyncAt: new Date(), lastSyncError: null },
        })
      }

      results.push({ mailboxEmail: mb.email, provider: mb.provider, repliesFound: count })
      totalReplies += count

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ mailboxEmail: mb.email, provider: mb.provider, repliesFound: 0, error: msg })
      await db.connectedMailbox.update({
        where: { id: mb.id },
        data:  { lastSyncError: msg.slice(0, 500) },
      }).catch(() => null)
    }
  }

  return NextResponse.json({ ok: true, totalReplies, results })
}

// ─── Core reply processing: shared with cron ─────────────────────────────────

interface ReplyToProcess {
  workspaceId:        string
  fromEmail:          string
  subject:            string
  bodyText:           string
  receivedAt:         Date
  inReplyToHeader:    string | null
  providerMessageId:  string
  providerThreadId?:  string | null
}

async function processReply(params: ReplyToProcess): Promise<boolean> {
  // Find the EmailSend this is a reply to.
  // Priority: threadId > inReplyToHeader (RFC 2822) > providerMessageId (legacy)
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
      campaign: { include: { workspace: { select: { owner: { select: { clerkId: true } } } } } },
    },
  })

  if (!emailSend) {
    console.info('[sync] NO_MATCH', JSON.stringify({
      workspaceId:       params.workspaceId,
      fromEmail:         params.fromEmail,
      subject:           params.subject?.slice(0, 80),
      inReplyToHeader:   params.inReplyToHeader,
      providerMessageId: params.providerMessageId,
      providerThreadId:  params.providerThreadId,
    }))
    return false
  }

  console.info('[sync] MATCHED', JSON.stringify({
    emailSendId: emailSend.id,
    leadId:      emailSend.leadId,
    fromEmail:   params.fromEmail,
  }))

  // Idempotency
  const existing = await db.emailReply.findFirst({ where: { emailSendId: emailSend.id } })
  if (existing) return false

  const cleanBody = await extractEmailBody('', params.bodyText)
  const result    = await classifyReply(cleanBody || params.bodyText, params.subject)
  // Out-of-office: not an answer. Recording it would stop the sequence and
  // block the real reply that follows (one reply per send).
  if (result.isAutoReply) {
    console.info('[mailbox/sync] auto-reply ignored', JSON.stringify({ emailSendId: emailSend.id }))
    return false
  }

  const now     = new Date()
  const snippet = (cleanBody || params.bodyText).slice(0, 160)
  const qualifiedAt = (result.classification === 'POSITIVE' || result.classification === 'MEETING_REQUEST') ? now : undefined
  const lostAt      = (result.classification === 'NEGATIVE' || result.classification === 'NOT_INTERESTED')  ? now : undefined

  await db.$transaction(async (tx) => {
    const dup = await tx.emailReply.findFirst({ where: { emailSendId: emailSend.id } })
    if (dup) return
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
        ...(result.classification === 'POSITIVE' || result.classification === 'MEETING_REQUEST'
          ? { status: 'qualified' }
          : result.classification === 'NEGATIVE' || result.classification === 'NOT_INTERESTED'
            ? { status: 'lost' }
            : {}),
        ...(qualifiedAt ? { qualifiedAt } : {}),
        ...(lostAt      ? { lostAt }      : {}),
      },
    })
  })

  {
    void createNotification(
      buildReplyNotification({
        workspaceId:    params.workspaceId,
        leadName:       `${emailSend.lead.firstName} ${emailSend.lead.lastName}`,
        company:        emailSend.lead.company ?? null,
        classification: result.classification,
        leadId:         emailSend.leadId,
        campaignId:     emailSend.campaignId,
        campaignName:   emailSend.campaign.name,
      }),
    ).catch(() => null)
  }

  return true
}
