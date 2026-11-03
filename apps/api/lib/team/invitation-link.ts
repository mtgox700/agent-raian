/**
 * The invitation link and its e-mail. The token is 32 random bytes; only its
 * SHA-256 is stored, so a database read never yields a usable link.
 */

import { createHash, randomBytes } from 'node:crypto'
import { brand } from '@/lib/brand'
import { getFromAddress, sendEmail } from '@/lib/services/resend-client'
import type { WorkspaceRole } from '@prisma/client'
import { cleanDisplayName } from '@/lib/email/sender-identity'

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/

export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') }
}

/** Null for anything that cannot be a token: no lookup is made for it. */
export function hashInvitationToken(token: string): string | null {
  if (!TOKEN_FORMAT.test(token)) return null
  return createHash('sha256').update(token).digest('hex')
}

export function invitationUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? `https://www.${brand.domain}`).replace(/\/$/, '')
  return `${base}/invite/${token}`
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER:  'Propriétaire',
  ADMIN:  'Admin',
  MEMBER: 'Membre',
  VIEWER: 'Lecture seule',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export async function sendInvitationEmail(input: {
  to: string
  workspaceName: string
  inviterName: string
  role: WorkspaceRole
  url: string
}): Promise<void> {
  // Free text typed by users: no line breaks in the subject, escaped in the body.
  const workspaceName = cleanDisplayName(input.workspaceName) ?? brand.name
  const inviterName = cleanDisplayName(input.inviterName) ?? 'Un membre de l’équipe'
  const workspace = escapeHtml(workspaceName)
  const inviter = escapeHtml(inviterName)
  const role = ROLE_LABELS[input.role].toLowerCase()
  await sendEmail({
    to:      input.to,
    from:    getFromAddress(),
    subject: `${inviterName} vous invite dans l’espace ${workspaceName} sur ${brand.name}`.slice(0, 200),
    tags:    [{ name: 'type', value: 'team_invitation' }],
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.5">
<p>Bonjour,</p>
<p><strong>${inviter}</strong> vous invite à rejoindre l’espace <strong>${workspace}</strong> sur ${brand.name}, en tant que ${role}.</p>
<p><a href="${input.url}" style="display:inline-block;padding:10px 18px;background:#0e7490;color:#fff;text-decoration:none;border-radius:8px">Rejoindre l’espace</a></p>
<p style="color:#555;font-size:13px">Le lien est personnel : il ne fonctionne que pour cette adresse e-mail, une seule fois, pendant 7 jours. Si vous n’attendiez pas cette invitation, ignorez ce message.</p>
</body></html>`,
  })
}
