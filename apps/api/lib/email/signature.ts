/**
 * Pro email signature (Trust Pack).
 *
 * Doctrine (board, 2026-07-14): the BODY of a cold email must look hand-typed;
 * ALL the brand trust lives in the signature: exactly like a real employee's
 * Gmail signature. Sober two-column table (optional small logo | identity),
 * no banners, no marketing colors, max one link row.
 */

import { z } from 'zod'
import { normalizePhone } from '@/lib/phone/phone'

/** Empty, or something that reads as a web address ("entreprise.fr", "https://…"). */
function isWebAddress(value: string): boolean {
  if (value === '') return true
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') && !/\s/.test(value)
  } catch {
    return false
  }
}

export const signatureSchema = z.object({
  enabled:     z.boolean().default(false),
  fullName:    z.string().trim().max(80).default(''),
  role:        z.string().trim().max(120).default(''),
  company:     z.string().trim().max(120).default(''),
  website:     z.string().trim().max(200).default(''),
  linkedinUrl: z.string().trim().max(300).default(''),
  logoUrl:     z.string().trim().max(500).default(''),
  /** Professional WhatsApp number: adds a "WhatsApp" link the prospect opens to write first. */
  whatsapp:    z.string().trim().max(30).default(''),
  /** Optional raw HTML signature (pasted from Outlook/Gmail). Overrides the fields above. */
  customHtml:  z.string().max(20000).default(''),
})

/**
 * What a save accepts: links must read as web addresses. Kept apart from
 * signatureSchema, which also reads signatures already stored: a stricter
 * read would silently drop an older signature from every email.
 */
export const signatureInputSchema = signatureSchema.superRefine((sig, ctx) => {
  if (!isWebAddress(sig.website)) {
    ctx.addIssue({ code: 'custom', path: ['website'], message: 'Site web : saisissez une adresse comme entreprise.fr' })
  }
  if (!isWebAddress(sig.linkedinUrl)) {
    ctx.addIssue({ code: 'custom', path: ['linkedinUrl'], message: 'Profil LinkedIn : saisissez une adresse web' })
  }
  if (sig.logoUrl !== '' && !/^https:\/\/\S+$/i.test(sig.logoUrl)) {
    ctx.addIssue({ code: 'custom', path: ['logoUrl'], message: 'Logo : saisissez une adresse https://' })
  }
  if (sig.whatsapp !== '' && !whatsappDigits(sig.whatsapp)) {
    ctx.addIssue({ code: 'custom', path: ['whatsapp'], message: 'WhatsApp : saisissez le numéro au format international, ex. +33 6 12 34 56 78' })
  }
})

/**
 * The number as wa.me expects it (country code + number, digits only), or
 * null. Requires the international form: a national "06…" would open a chat
 * with the wrong person abroad.
 */
export function whatsappDigits(raw: string): string | null {
  return normalizePhone(raw)
}

/** Direct chat link, used in the settings preview. */
export function whatsappChatUrl(sig: Pick<WorkspaceSignature, 'whatsapp' | 'fullName'>): string | null {
  const digits = whatsappDigits(sig.whatsapp)
  if (!digits) return null
  const text = sig.fullName
    ? `Bonjour ${sig.fullName}, je vous écris suite à votre e-mail.`
    : 'Bonjour, je vous écris suite à votre e-mail.'
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export type WorkspaceSignature = z.infer<typeof signatureSchema>

/** Safe parse from the Workspace.emailSignature Json column. */
export function parseSignature(raw: unknown): WorkspaceSignature | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = signatureSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function prettyHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

/**
 * Minimal allowlist-style sanitizer for a user-pasted HTML signature
 * (copied from Outlook / Gmail / Infomaniak). Keeps tables, text styling,
 * links and images; removes active content (scripts, frames, forms, event
 * handlers, javascript:/vbscript:/non-image data: URLs).
 */
export function sanitizeSignatureHtml(html: string): string {
  const BLOCK =
    '(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|option|meta|link|base|svg|math|template|noscript)'
  let s = html
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(new RegExp('<' + BLOCK + '\\b[\\s\\S]*?<\\/\\1\\s*>', 'gi'), '')
  s = s.replace(new RegExp('<\\/?' + BLOCK + '\\b[^>]*>', 'gi'), '')
  // Attribute separators include "/" (<img/src=x/onerror=…>).
  s = s.replace(/[\s/]+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  s = s.replace(/[\s/]+(srcdoc|formaction|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Control characters before the scheme are ignored by mail clients
  // (" \tjavascript:"): they are matched on purpose.
  s = s.replace(
    // eslint-disable-next-line no-control-regex
    /[\s/](href|src)\s*=\s*("|')[\s\u0000-\u001f]*(javascript|vbscript|data(?!:image\/(png|jpe?g|gif|webp)))[^"']*\2/gi,
    ' $1="#"',
  )
  s = s.replace(/[\s/](href|src)\s*=\s*(javascript|vbscript):[^\s>]*/gi, ' $1="#"')
  s = s.trim()
  if (!s) return ''
  return '<div style="margin-top:24px;">' + s + '</div>'
}

/**
 * Gmail-like signature block. Muted grays, 13px, optional 44px logo.
 * Returns '' when disabled or when there is nothing meaningful to show.
 */
export function renderSignatureHtml(
  sig: WorkspaceSignature | null,
  /** Tracked link for this email (see /api/track/whatsapp); the direct chat link otherwise. */
  opts: { whatsappHref?: string } = {},
): string {
  if (!sig?.enabled) return ''
  const whatsappHref = whatsappDigits(sig.whatsapp) ? (opts.whatsappHref ?? whatsappChatUrl(sig)) : null
  const whatsappLink = whatsappHref
    ? `<a href="${escapeHtml(whatsappHref)}" style="color:#6b7280;text-decoration:none;">WhatsApp</a>`
    : ''
  if (sig.customHtml && sig.customHtml.trim()) {
    const custom = sanitizeSignatureHtml(sig.customHtml)
    return whatsappLink ? `${custom}<p style="margin:6px 0 0;font-size:12px;">${whatsappLink}</p>` : custom
  }
  const name = escapeHtml(sig.fullName)
  if (!name) return ''

  const roleLine = [sig.role, sig.company].filter(Boolean).map(escapeHtml).join(' · ')

  const links: string[] = []
  if (sig.website) {
    links.push(`<a href="${escapeHtml(toHref(sig.website))}" style="color:#6b7280;text-decoration:none;">${escapeHtml(prettyHost(sig.website))}</a>`)
  }
  if (sig.linkedinUrl) {
    links.push(`<a href="${escapeHtml(toHref(sig.linkedinUrl))}" style="color:#6b7280;text-decoration:none;">LinkedIn</a>`)
  }
  if (whatsappLink) links.push(whatsappLink)

  const logoCell = sig.logoUrl
    ? `<td style="padding-right:12px;vertical-align:top;"><img src="${escapeHtml(sig.logoUrl)}" height="44" alt="${escapeHtml(sig.company || name)}" style="height:44px;width:auto;max-width:160px;border-radius:8px;display:block;border:0;"></td>`
    : ''

  return `
<table cellpadding="0" cellspacing="0" style="margin-top:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <tr>
    ${logoCell}
    <td style="vertical-align:top;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#111827;">${name}</p>
      ${roleLine ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${roleLine}</p>` : ''}
      ${links.length > 0 ? `<p style="margin:4px 0 0;font-size:12px;">${links.join('<span style="color:#d1d5db;"> &nbsp;·&nbsp; </span>')}</p>` : ''}
    </td>
  </tr>
</table>`
}
