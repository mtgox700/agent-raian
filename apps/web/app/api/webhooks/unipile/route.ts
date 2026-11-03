/**
 * POST /api/webhooks/unipile: Unipile server-to-server callbacks.
 *
 * Phase A: hosted-auth notify: { status, account_id, name } where `name` is
 * our ConnectedChannel.id (set when the link was created). Flips the row to
 * CONNECTED / ERROR. Route is public (middleware allows /api/webhooks/*);
 * correlation is by our own cuid, which is unguessable: and the handler only
 * ever updates rows that are still PENDING, so replays are inert.
 *
 * Phase B (next): `new_message` events (LinkedIn/WhatsApp replies) will land
 * here too and feed the reply classifier.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit/audit'
import { objectedLead } from '@/lib/privacy/opt-out'
import { buildReplyNotification, createNotification } from '@/lib/services/notifications.service'
import type { ReplyCategory } from '@/lib/agents/reply-classifier'
import { describeRejection, verifyUnipileWebhook } from '@/lib/multichannel/webhook-auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const auth = verifyUnipileWebhook(req)
  if (auth === 'rejected') {
    console.warn(`[webhooks/unipile] rejected: ${describeRejection(req)}`)
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  if (auth === 'unconfigured' && process.env.VERCEL_ENV === 'production') {
    console.error('[webhooks/unipile] UNIPILE_WEBHOOK_SECRET is not set: refused in production')
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  if (auth === 'unconfigured') {
    console.warn('[webhooks/unipile] UNIPILE_WEBHOOK_SECRET is not set: webhook accepted without authentication')
  }

  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!payload) return NextResponse.json({ ok: false }, { status: 400 })

  // ── Hosted-auth notify ─────────────────────────────────────────────────────
  const name = typeof payload.name === 'string' ? payload.name : null
  const accountId = typeof payload.account_id === 'string' ? payload.account_id : null
  const status = typeof payload.status === 'string' ? payload.status.toUpperCase() : ''

  if (name && accountId) {
    const ok = status.includes('SUCCESS') || status === 'OK' || status === 'CREATION_SUCCESS'
    try {
      const updated = await db.connectedChannel.updateMany({
        where: { id: name, status: 'PENDING' },
        data: ok
          ? { unipileAccountId: accountId, status: 'CONNECTED', lastError: null }
          : { status: 'ERROR', lastError: `Unipile: ${status || 'creation failed'}` },
      })
      console.info('[webhooks/unipile] auth-notify', JSON.stringify({ name, ok, matched: updated.count }))
      if (ok && updated.count === 1) {
        const channel = await db.connectedChannel.findUnique({ where: { id: name }, select: { workspaceId: true, ownerUserId: true, provider: true } })
        if (channel) {
          await recordAudit(db, { workspaceId: channel.workspaceId, userId: channel.ownerUserId }, {
            action: 'channel.connected', target: { type: 'channel', id: name }, details: { provider: channel.provider },
          })
        }
      }
    } catch (err) {
      console.error('[webhooks/unipile] notify failed:', err instanceof Error ? err.message : String(err))
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Inbound message (LinkedIn/WhatsApp reply): Phase B3 ──────────────────
  // Match the sender's provider_id against the providerThreadId we stored at
  // send time -> identify the lead -> classify -> STOP the sequence (the exact
  // guarantee competitors break). Defensive parsing: Unipile payload shapes
  // vary by event version.
  const acctId = typeof payload.account_id === 'string' ? payload.account_id : null
  const sender = payload.sender as Record<string, unknown> | undefined
  const senderId =
    (typeof sender?.attendee_provider_id === 'string' && sender.attendee_provider_id) ||
    (typeof payload.sender_id === 'string' && payload.sender_id) || null
  const msg = payload.message as Record<string, unknown> | string | undefined
  const text = typeof msg === 'string' ? msg : (typeof msg?.text === 'string' ? msg.text : null)

  if (acctId && senderId && text) {
    try {
      const channel = await db.connectedChannel.findUnique({
        where: { unipileAccountId: acctId },
        select: { workspaceId: true },
      })
      if (channel) {
        const send = await db.emailSend.findFirst({
          where: {
            providerThreadId: senderId,
            campaign: { workspaceId: channel.workspaceId },
          },
          select: {
            id: true, leadId: true, campaignId: true,
            emailStep: { select: { subject: true } },
            lead:      { select: { firstName: true, lastName: true, company: true } },
            campaign:  { select: { name: true } },
          },
          orderBy: { sentAt: 'desc' },
        })
        if (send?.leadId) {
          // Classify (non-fatal) then stop the sequence: same rules as email
          // replies (lib/email/poll-inboxes.ts): doNotContact halts every
          // future step, a positive reply qualifies the lead, a refusal loses it.
          let category: ReplyCategory = 'NEUTRAL'
          let dbClassification: string = 'NEUTRAL'
          let confidence = 50
          try {
            const { classifyReply } = await import('@/lib/agents/reply-classifier')
            const result = await classifyReply(text, send.emailStep?.subject ?? '')
            if (result.isAutoReply) {
              console.info('[webhooks/unipile] auto-reply ignored', JSON.stringify({ leadId: send.leadId }))
              return NextResponse.json({ ok: true, autoReply: true })
            }
            category = result.classification
            dbClassification = result.dbClassification
            confidence = typeof result.confidenceInt === 'number' ? result.confidenceInt : 50
          } catch { /* classifier unavailable — stop the sequence anyway */ }

          const now = new Date()
          const qualified = category === 'POSITIVE' || category === 'MEETING_REQUEST'

          // Reply, campaign counter and lead in one transaction: the lead used
          // to be updated first and a failed reply insert was swallowed, so a
          // lead could show a reply that the inbox never listed.
          // Idempotence: Unipile retries webhooks on slow responses.
          const recorded = await db.$transaction(async (tx) => {
            const existing = await tx.emailReply.findFirst({
              where:  { emailSendId: send.id, bodyText: text },
              select: { id: true },
            })
            if (existing) return false
            if (await objectedLead(tx, send.leadId)) return false

            await tx.emailReply.create({
              data: {
                emailSendId:    send.id,
                campaignId:     send.campaignId,
                leadId:         send.leadId,
                receivedAt:     now,
                fromEmail:      `linkedin:${senderId}`,
                bodyText:       text,
                classification: dbClassification,
                confidence,
              },
            })
            if (category !== 'NOT_INTERESTED') {
              await tx.campaign.update({
                where: { id: send.campaignId },
                data:  { replyCount: { increment: 1 } },
              })
            }
            await tx.lead.update({
              where: { id: send.leadId },
              data: {
                doNotContact:            true,
                lastReplyAt:             now,
                lastReplyClassification: category,
                lastReplySnippet:        text.slice(0, 500),
                ...(qualified ? { status: 'qualified', qualifiedAt: now } : {}),
                ...(category === 'NEGATIVE' ? { status: 'lost', lostAt: now } : {}),
                ...(category === 'NOT_INTERESTED' ? { lostAt: now } : {}),
              },
            })
            return true
          })

          // Same notification as an email reply (type per category, lead link
          // for the bell); never twice for a replayed webhook.
          if (recorded) {
            const lead = send.lead
            const payload = buildReplyNotification({
              workspaceId:    channel.workspaceId,
              leadName:       `${lead.firstName} ${lead.lastName}`,
              company:        lead.company,
              classification: category,
              leadId:         send.leadId,
              campaignId:     send.campaignId,
              campaignName:   send.campaign.name,
            })
            await createNotification({ ...payload, title: `${payload.title}` }).catch((err: unknown) => {
              console.error('[webhooks/unipile] notification failed:', err instanceof Error ? err.message : String(err))
            })
          }
          console.info('[webhooks/unipile] linkedin-reply', JSON.stringify({ leadId: send.leadId, classification: category, recorded }))
          return NextResponse.json({ ok: true })
        }
      }
    } catch (err) {
      // 500 so Unipile retries (recording is idempotent). Answering 200 here
      // dropped the prospect's reply for good on a transient database error.
      console.error('[webhooks/unipile] message handling failed:', err instanceof Error ? err.message : String(err))
      return NextResponse.json({ ok: false }, { status: 500 })
    }
  }

  // Unknown/unsupported event: acknowledge so Unipile doesn't retry forever.
  console.info('[webhooks/unipile] ignored event', JSON.stringify(Object.keys(payload)))
  return NextResponse.json({ ok: true, ignored: true })
}
