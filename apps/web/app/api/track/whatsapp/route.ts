/**
 * GET /api/track/whatsapp?sid=<emailSendId>
 *
 * The "WhatsApp" link of a campaign email's signature. Redirects the
 * prospect to a WhatsApp chat with the sender, the first message prefilled:
 * the prospect writes first, so no business-initiated message ever goes to
 * someone who did not ask (WhatsApp's opt-in rule).
 *
 * The click is a buying signal: the email is marked CLICKED and the
 * workspace notified. Mail security scanners open links seconds after
 * delivery, so a click in the first minutes is not reported as a person.
 *
 * Not an open redirect: the target number comes from the workspace's saved
 * signature, never from the URL.
 */

import { db } from '@/lib/db'
import { rateLimit, getClientKey } from '@/lib/security/rate-limit'
import { parseSignature, whatsappChatUrl } from '@/lib/email/signature'
import { createNotification } from '@/lib/services/notifications.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Clicks sooner than this after sending are treated as link scanners. */
const SCANNER_WINDOW_MS = 2 * 60 * 1000

const CLICKABLE = ['SENT', 'DELIVERED', 'OPENED']

function fallback(): Response {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.phantera-tn.com'
  return Response.redirect(base, 302)
}

export async function GET(request: Request): Promise<Response> {
  const sid = new URL(request.url).searchParams.get('sid')
  if (!sid || sid.length > 64) return fallback()

  const send = await db.emailSend.findUnique({
    where:  { id: sid },
    select: {
      id: true, status: true, sentAt: true, clickedAt: true, campaignId: true, leadId: true,
      lead:     { select: { firstName: true, lastName: true, company: true } },
      campaign: { select: { name: true, workspaceId: true, workspace: { select: { emailSignature: true } } } },
    },
  }).catch(() => null)
  if (!send) return fallback()

  const signature = parseSignature(send.campaign.workspace.emailSignature)
  const target = signature ? whatsappChatUrl(signature) : null
  if (!target) return fallback()

  const limit = rateLimit(getClientKey(request), { windowSec: 60, max: 30, scope: 'track:whatsapp' })
  const isScanner = !send.sentAt || Date.now() - send.sentAt.getTime() < SCANNER_WINDOW_MS
  if (limit.allowed && !isScanner && !send.clickedAt) {
    await recordClick(send).catch((err: unknown) => {
      console.error('[track/whatsapp] record failed:', err instanceof Error ? err.message : String(err))
    })
  }

  return Response.redirect(target, 302)
}

async function recordClick(send: {
  id: string
  status: string
  campaignId: string
  leadId: string
  lead: { firstName: string; lastName: string; company: string | null }
  campaign: { name: string; workspaceId: string }
}): Promise<void> {
  // clickedAt: null makes the first click win; a second click is ignored.
  const updated = await db.emailSend.updateMany({
    where: { id: send.id, clickedAt: null },
    data:  { clickedAt: new Date(), ...(CLICKABLE.includes(send.status) ? { status: 'CLICKED' } : {}) },
  })
  if (updated.count === 0) return

  const company = send.lead.company ? ` @ ${send.lead.company}` : ''
  await createNotification({
    workspaceId: send.campaign.workspaceId,
    type:        'LEAD_CLICKED_WHATSAPP',
    title:       'Intérêt WhatsApp',
    body:        `${send.lead.firstName} ${send.lead.lastName}${company} a ouvert une conversation WhatsApp avec vous : ${send.campaign.name}`,
    // No leadId: the bell opens the hot-leads page for a lead id, and a click
    // alone does not make the lead hot. It opens the campaign instead.
    leadId:      undefined,
    campaignId:  send.campaignId,
    data:        { channel: 'whatsapp', leadId: send.leadId },
  })
}
