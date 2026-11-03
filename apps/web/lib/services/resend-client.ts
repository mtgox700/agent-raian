/**
 * Phantera: Resend Email Client
 *
 * Email delivery via Resend API.
 * Mock mode active when RESEND_API_KEY is not set (logs to console).
 *
 * Resend free tier: 3,000 emails/month.
 * Template renderer replaces {{firstName}}, {{company}}, {{title}}, {{industry}} placeholders.
 */

import { Resend } from 'resend'
import { brand } from '@/lib/brand'

// ─── Lazy Resend singleton ────────────────────────────────────────────────────

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY not configured')
    _resend = new Resend(apiKey)
  }
  return _resend
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendEmailParams {
  to: string
  from: string
  subject: string
  html: string
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
  /** RFC 8058 / GDPR: unsubscribe URL injected by the caller */
  listUnsubscribeUrl?: string
}

export interface SendEmailResult {
  messageId: string
  mock?: boolean
}

// ─── Template rendering ───────────────────────────────────────────────────────

export interface EmailTemplateVars {
  firstName: string
  lastName: string
  company: string
  title: string
  industry: string
}

/**
 * HTML-escape a string so it can be safely interpolated into an HTML email
 * body. Apollo / Hunter / manual leads can contain `<script>` payloads in
 * fields like company: without escaping they would be interpreted by the
 * recipient's email client (mostly sandboxed but defense-in-depth matters).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Replaces {{variable}} placeholders in email body/subject with lead data.
 * Unknown variables are replaced with an empty string.
 *
 * The result is plain text: it is used as is for the subject line and for
 * LinkedIn messages, where escaping showed "L&#39;Atelier" to the prospect.
 * HTML escaping happens once, in textToHtml.
 */
export function renderEmailTemplate(template: string, vars: EmailTemplateVars): string {
  return template
    .replace(/\{\{firstName\}\}/g, () => vars.firstName)
    .replace(/\{\{lastName\}\}/g,  () => vars.lastName)
    .replace(/\{\{company\}\}/g,   () => vars.company  || 'votre entreprise')
    .replace(/\{\{title\}\}/g,     () => vars.title    || 'vous')
    .replace(/\{\{industry\}\}/g,  () => vars.industry || 'votre secteur')
    .replace(/\{\{[^}]+\}\}/g, '') // remove any remaining unknowns
}

/**
 * A rendered subject is one line: lead fields come from Apollo or CSV files,
 * and a line break in one would add a header to the message.
 */
export function renderSubject(template: string, vars: EmailTemplateVars): string {
  return renderEmailTemplate(template, vars).replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
}

/**
 * Renders outreach text as a HUMAN-looking email.
 *
 * Trust Pack doctrine (board, 2026-07-14): no gray background, no white card,
 * no border-radius, no "sent via <brand>" line: those are mass-mail signals
 * that push cold email into Gmail's Promotions tab and kill replies. The
 * result must be indistinguishable from a message typed in Gmail; brand trust
 * lives in the optional signature block (lib/email/signature.ts).
 */
export function textToHtml(
  text: string,
  preheader?: string,
  trackingPixelUrl?: string,
  listUnsubscribeUrl?: string,
  signatureHtml?: string,
): string {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  ${preheader ? `<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ''}
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;font-size:15px;color:#1f2937;">
    ${paragraphs}
    ${signatureHtml ?? ''}
    ${listUnsubscribeUrl
      ? `<p style="margin:28px 0 0;font-size:11px;color:#b5bcc7;"><a href="${listUnsubscribeUrl}" style="color:#b5bcc7;">Se désabonner</a></p>`
      : ''}
  </div>
  ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;">` : ''}
</body>
</html>`
}

// ─── Send email ───────────────────────────────────────────────────────────────

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY

  // Mock mode
  if (!apiKey) {
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log(`[Resend MOCK] Would send to ${params.to}`)
    console.log(`  Subject: ${params.subject}`)
    console.log(`  From: ${params.from}`)
    console.log(`  Mock ID: ${mockId}`)
    return { messageId: mockId, mock: true }
  }

  const resend = getResend()

  // RFC 8058 + Gmail/Outlook bulk-sender requirements (mandatory from 2024):
  // Every commercial/outreach email must carry List-Unsubscribe headers.
  const headers: Record<string, string> = {}
  const unsubUrl = params.listUnsubscribeUrl
  if (unsubUrl) {
    headers['List-Unsubscribe'] = `<${unsubUrl}>, <mailto:unsubscribe@phantera-tn.com?subject=unsubscribe>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  // Resend enforces 5 requests/second. Batch sends used to lose ~half their
  // emails to "Too many requests" (they stayed stuck PENDING). We retry the
  // rate-limit error with exponential backoff so transient 429s self-heal
  // centralised here so every caller (auto-launch, cron, retry-pending) benefits.
  const MAX_ATTEMPTS = 4
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      tags: params.tags,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    })

    if (!error) {
      if (!data?.id) throw new Error('Resend returned no message ID')
      return { messageId: data.id }
    }

    lastError = error.message
    const isRateLimit = /too many requests|rate limit|429/i.test(error.message)
    if (!isRateLimit || attempt === MAX_ATTEMPTS) {
      throw new Error(`Resend error: ${error.message}`)
    }

    // Backoff: 600ms, 1200ms, 2400ms: keeps us under the 5 req/s ceiling.
    await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)))
  }

  // Unreachable in practice: the loop either returns or throws.
  throw new Error(`Resend error: ${lastError}`)
}

// ─── Default sender address ───────────────────────────────────────────────────

export function getFromAddress(sendingDomain?: string | null): string {
  const domain = sendingDomain?.trim() || process.env.SENDING_DOMAIN?.trim()
  if (domain) {
    return `${brand.name} <outreach@${domain}>`
  }
  return process.env.RESEND_FROM_EMAIL ?? `${brand.name} <outreach@${brand.domain}>`
}
