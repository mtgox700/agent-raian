/**
 * Phantera: Agent 5: Inbound Email Webhook
 *
 * Called by the Cloudflare Email Worker when a lead replies to an outbound
 * email sent with replyTo: reply+{emailSendId}@phantera-tn.com
 *
 * Validates the request, parses the sendId, classifies the reply with Claude
 * Haiku, and persists the result inside a single DB transaction.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { limit } from '@/lib/security/shared-rate-limit'
import { objectedLead } from '@/lib/privacy/opt-out'
import { classifyReply, type ReplyCategory } from '@/lib/agents/reply-classifier'
import { createNotification, buildReplyNotification } from '@/lib/services/notifications.service'
import { extractEmailBody } from '@/lib/utils/email-parser'
import { trackServer, flushServerEvents } from '@/lib/analytics/server-events'
import { safeCompare } from '@/lib/security/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Claude Haiku classification can take up to ~10s

// ─── Request body ─────────────────────────────────────────────────────────────

interface InboundEmailBody {
  to: string
  from: string
  raw: string
  subject?: string
  text?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSendId(to: string): string | null {
  const match = /reply\+([^@]+)@/.exec(to)
  return match?.[1] ?? null
}

function resolveLeadStatus(category: ReplyCategory): string | null {
  if (category === 'POSITIVE' || category === 'MEETING_REQUEST') return 'qualified'
  if (category === 'NEGATIVE' || category === 'NOT_INTERESTED') return 'lost'
  return null // NEUTRAL: no update
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate webhook (constant-time compare to avoid timing leaks)
  const secret = req.headers.get('x-webhook-secret')
  if (!safeCompare(secret, process.env.INBOUND_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: InboundEmailBody
  try {
    body = (await req.json()) as InboundEmailBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 2. Extract sendId from the To address
  const sendId = parseSendId(body.to)
  if (!sendId) {
    console.warn('[Agent5] No sendId found in To address:', body.to)
    return NextResponse.json({ ok: true, skipped: true })
  }

  // 3. Load the EmailSend with its lead and campaign.
  //    Includes workspace.owner.clerkId so the activation event can be tied
  //    to the owner's PostHog person (matches client-side identify).
  const emailSend = await db.emailSend.findUnique({
    where: { id: sendId },
    include: {
      lead:     true,
      campaign: {
        include: {
          workspace: { select: { owner: { select: { clerkId: true } } } },
        },
      },
    },
  })
  if (!emailSend) {
    console.warn('[Agent5] EmailSend not found for id:', sendId)
    return NextResponse.json({ ok: true, skipped: true })
  }

  // A send already answered costs nothing more: checked before the model
  // call, so repeated mail to one reply address cannot run up LLM costs.
  if (await db.emailReply.findFirst({ where: { emailSendId: sendId }, select: { id: true } })) {
    return NextResponse.json({ ok: true, skipped: true })
  }
  const throttle = await limit(`send:${sendId}`, { windowSec: 3600, max: 5, scope: 'inbound-reply' })
  if (!throttle.allowed) return NextResponse.json({ ok: true, skipped: true })

  // 4. Resolve the reply body: strip SMTP headers, MIME parts, quoted text
  const replyBody = await extractEmailBody(body.raw, body.text)

  // 5. Classify with Claude Haiku
  const result = await classifyReply(replyBody, body.subject ?? '')
  // Out-of-office: not an answer. Recording it would stop the sequence and
  // block the real reply that follows (one reply per send).
  if (result.isAutoReply) {
    console.info('[inbound-email] auto-reply ignored', JSON.stringify({ emailSendId: emailSend.id }))
    return NextResponse.json({ ok: true, autoReply: true })
  }

  const now = new Date()
  const snippet = replyBody.slice(0, 160)

  // Timestamps for qualified/lost transitions
  const qualifiedAt =
    (result.classification === 'POSITIVE' || result.classification === 'MEETING_REQUEST')
      ? now : undefined
  const lostAt =
    (result.classification === 'NEGATIVE' || result.classification === 'NOT_INTERESTED')
      ? now : undefined

  // 6. Persist in a transaction (idempotent: guard against Worker retries)
  await db.$transaction(async (tx) => {
    const existing = await tx.emailReply.findFirst({ where: { emailSendId: sendId } })
    if (existing) return // already processed: skip silently
    if (await objectedLead(tx, emailSend.leadId)) return

    await tx.emailReply.create({
      data: {
        emailSendId:    sendId,
        campaignId:     emailSend.campaignId,
        leadId:         emailSend.leadId,
        receivedAt:     now,
        fromEmail:      body.from,
        bodyText:       replyBody,
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

    const newStatus = resolveLeadStatus(result.classification)

    // Always update reply intelligence fields
    await tx.lead.update({
      where: { id: emailSend.leadId },
      data: {
        lastReplyAt:             now,
        lastReplyClassification: result.classification,
        lastReplySnippet:        snippet,
        doNotContact:            true, // stop further outreach
        ...(newStatus !== null ? { status: newStatus } : {}),
        ...(qualifiedAt ? { qualifiedAt } : {}),
        ...(lostAt      ? { lostAt }      : {}),
      },
    })
  })

  // 7. Fire a notification (non-blocking: does not affect the response)
  {
    const lead = emailSend.lead
    const leadName = `${lead.firstName} ${lead.lastName}`

    void createNotification(
      buildReplyNotification({
        workspaceId:    emailSend.campaign.workspaceId,
        leadName,
        company:        lead.company ?? null,
        classification: result.classification,
        leadId:         emailSend.leadId,
        campaignId:     emailSend.campaignId,
        campaignName:   emailSend.campaign.name,
      }),
    ).catch((err: unknown) => {
      console.error('[Agent5] Failed to create notification:', err)
    })
  }

  // ── Analytics: reply received milestone (fires for every reply, not just first) ──
  // PostHog can compute "first reply per user" downstream via funnel queries.
  const ownerClerkId = emailSend.campaign.workspace.owner?.clerkId
  if (ownerClerkId) {
    trackServer(ownerClerkId, 'first_reply_received', {
      workspaceId:    emailSend.campaign.workspaceId,
      campaignId:     emailSend.campaignId,
      leadId:         emailSend.leadId,
      classification: result.classification,
    })
    await flushServerEvents()
  }

  console.info(
    `[Agent5] Reply from ${body.from} -> ${result.classification} (confidence: ${result.confidence.toFixed(2)})`,
  )

  return NextResponse.json({ ok: true, classification: result.classification })
}
