import { Webhook } from 'svix'
import { NextResponse } from 'next/server'
import { recordClick, recordOpen } from '@/lib/email/engagement'
import { db } from '@/lib/db'
import { recordOptOut } from '@/lib/privacy/opt-out'
import { suppressEmails } from '@/lib/deliverability/suppression'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked'

interface ResendWebhookEvent {
  type: ResendEventType
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    tags?: Array<{ name: string; value: string }>
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // ── Signature verification ────────────────────────────────────────────────
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const rawBody = await req.text()
  const svixId        = req.headers.get('svix-id') ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  let event: ResendWebhookEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent
  } catch (err) {
    console.error('[resend-webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── Route event ───────────────────────────────────────────────────────────
  const resendMessageId = event.data?.email_id
  if (!resendMessageId) return NextResponse.json({ ok: true })

  const emailSend = await db.emailSend.findFirst({
    where: { resendMessageId },
    select: {
      id: true, campaignId: true, leadId: true, openedAt: true,
      lead:     { select: { email: true } },
      campaign: { select: { workspaceId: true } },
    },
  })

  if (!emailSend) {
    console.log(`[resend-webhook] Unknown email_id: ${resendMessageId}`)
    return NextResponse.json({ ok: true })
  }

  try {
    switch (event.type) {
      case 'email.delivered':
        // Events arrive out of order: never downgrade OPENED/CLICKED/REPLIED.
        await db.emailSend.updateMany({
          where: { id: emailSend.id, status: { in: ['PENDING', 'SENT'] } },
          data: { status: 'DELIVERED' },
        })
        console.log(`[resend-webhook] delivered -> ${emailSend.id}`)
        break

      case 'email.opened': {
        // First open only (races with the pixel), never over CLICKED or a bounce.
        if (await recordOpen(db, emailSend.id)) {
          await db.campaign.update({
            where: { id: emailSend.campaignId },
            data:  { openCount: { increment: 1 } },
          })
          console.log(`[resend-webhook] opened -> ${emailSend.id}`)
        }
        break
      }

      case 'email.clicked':
        await recordClick(db, emailSend.id)
        console.log(`[resend-webhook] clicked -> ${emailSend.id}`)
        break

      case 'email.bounced':
        // Hard bounce: mark send FAILED and suppress this address workspace-wide
        // (every lead sharing the email, not just this one row) so no future
        // campaign re-sends to a known-bad address.
        await db.emailSend.update({
          where: { id: emailSend.id },
          data:  { status: 'FAILED', errorMessage: 'Bounced' },
        })
        await suppressEmails(db, emailSend.campaign.workspaceId, [emailSend.lead.email], 'HARD_BOUNCE')
        break

      case 'email.complained':
        // Spam complaint: GDPR/CAN-SPAM: stop ALL sends to this address immediately.
        await db.emailSend.update({
          where: { id: emailSend.id },
          data:  { status: 'FAILED', errorMessage: 'Spam complaint' },
        })
        await db.lead.update({
          where: { id: emailSend.leadId },
          data:  { status: 'lost' },
        })
        await recordOptOut(db, { workspaceId: emailSend.campaign.workspaceId, email: emailSend.lead.email, source: 'COMPLAINT' })
        break

      default:
        break
    }
  } catch (err) {
    console.error('[resend-webhook] DB update failed:', err)
  }

  return NextResponse.json({ ok: true })
}
