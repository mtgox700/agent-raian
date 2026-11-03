/**
 * GET  /api/webhooks/unsubscribe?sid=…  -> confirmation page with a button
 * POST /api/webhooks/unsubscribe?sid=…  -> unsubscribes (button, or RFC 8058
 *                                         one-click from the mail client)
 *
 * GET never changes anything: mail security scanners (Outlook Safe Links,
 * Gmail) open every link of an email, and used to unsubscribe prospects who
 * never asked to. The send id is an unguessable cuid and scopes the opt-out
 * to the sender's workspace; the address is also withdrawn from the shared
 * lead pool. Links sent before this change also carried `email=`, which used
 * to unsubscribe the address in every workspace: it is now ignored.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordOptOut } from '@/lib/privacy/opt-out'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_STYLE = `body{background:#0a0a0b;color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .card{background:#111;border:1px solid #222;border-radius:12px;padding:40px;text-align:center;max-width:400px;}
    h1{font-size:20px;margin:0 0 8px;}
    p{color:#9ca3af;margin:0;font-size:14px;}
    button{margin-top:24px;background:#f9fafb;color:#0a0a0b;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;}`

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  <style>
    ${PAGE_STYLE}
  </style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
</body>
</html>`
}

const HTML_DONE = page('Désabonnement confirmé', `<h1>Désabonnement confirmé</h1>
    <p>Vous ne recevrez plus de messages de cet expéditeur.</p>`)

const SID_PATTERN = /^[a-z0-9]{10,40}$/i

function confirmPage(sid: string): string {
  return page('Se désabonner', `<h1>Se désabonner</h1>
    <p>Confirmez pour ne plus recevoir de messages de cet expéditeur.</p>
    <form method="post" action="/api/webhooks/unsubscribe?sid=${sid}">
      <button type="submit">Confirmer le désabonnement</button>
    </form>`)
}

async function unsubscribeByEmailSendId(sid: string): Promise<boolean> {
  const emailSend = await db.emailSend.findUnique({
    where:  { id: sid },
    select: { leadId: true, lead: { select: { email: true } }, campaign: { select: { workspaceId: true } } },
  })
  if (!emailSend) return false

  // Every lead of the workspace sharing the address is anonymised, the shared
  // pool forgets it, and a fingerprint keeps it from ever coming back.
  await recordOptOut(db, { workspaceId: emailSend.campaign.workspaceId, email: emailSend.lead.email, source: 'UNSUBSCRIBE' })
  return true
}

function validSid(req: NextRequest): string | null {
  const sid = req.nextUrl.searchParams.get('sid')
  return sid && SID_PATTERN.test(sid) ? sid : null
}

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' }

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sid = validSid(req)
  if (!sid) return new NextResponse(HTML_DONE, { status: 200, headers: HTML_HEADERS })
  return new NextResponse(confirmPage(sid), { status: 200, headers: HTML_HEADERS })
}

// Button on the confirmation page, or RFC 8058 one-click POST from the mail client.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sid = validSid(req)
  if (sid) {
    await unsubscribeByEmailSendId(sid).catch((err: unknown) => {
      console.error('[unsubscribe] failed:', err instanceof Error ? err.message : String(err))
    })
  }
  const wantsHtml = (req.headers.get('accept') ?? '').includes('text/html')
  return wantsHtml
    ? new NextResponse(HTML_DONE, { status: 200, headers: HTML_HEADERS })
    : NextResponse.json({ ok: true })
}
