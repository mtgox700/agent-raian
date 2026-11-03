/**
 * GET/PUT/DELETE /api/workspace/sms: automatic SMS through the workspace's
 * own Brevo account. The key is checked against Brevo, stored encrypted and
 * never sent back.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { requireStepUp } from '@/lib/auth/step-up'
import { recordAudit } from '@/lib/audit/audit'
import type { Permission } from '@/lib/auth/permissions'
import { checkBrevoAccount } from '@/lib/sms/brevo'
import {
  activeSmsSettings,
  parseStoredSmsSettings,
  publicSmsSettings,
  smsSettingsInputSchema,
  toStoredSmsSettings,
} from '@/lib/sms/settings'
import { decrypt } from '@/lib/security/crypto'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'

async function session(permission: Permission) {
  const { userId } = await auth()
  return requireAccess(userId, permission)
}

export async function GET() {
  const workspaceAccess = await session('workspace.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const row = await db.workspace.findUnique({ where: { id: workspace.workspaceId }, select: { smsSettings: true } })

  // The credits check calls Brevo: at most a few times a minute per workspace.
  const active = activeSmsSettings(row?.smsSettings)
  const canCheck = (await limit(`sms-credits:${workspace.workspaceId}`, { windowSec: 60, max: 6, scope: 'sms-credits' })).allowed
  const account = active && canCheck ? await checkBrevoAccount(active.apiKey) : null
  return NextResponse.json({
    settings:   publicSmsSettings(row?.smsSettings),
    smsCredits: account?.ok ? account.smsCredits : null,
    keyRefused: account ? !account.ok && account.error === 'AUTH' : false,
  })
}

export async function PUT(req: Request) {
  const workspaceAccess = await session('settings.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const throttle = await limit(`sms-settings:${workspace.workspaceId}`, { windowSec: 60, max: 10, scope: 'sms-settings' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop d’essais : réessayez dans une minute.' }, { status: 429 })

  const parsed = smsSettingsInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 422 })
  }
  // A new key is a credential change; pausing or renaming the sender is not.
  if (parsed.data.apiKey) {
    const stepUp = await requireStepUp(db, workspace, { deny: { action: 'api_key.set', target: { type: 'integration', id: 'brevo' }, req } })
    if (stepUp) return stepUp
  }

  const row = await db.workspace.findUnique({ where: { id: workspace.workspaceId }, select: { smsSettings: true } })
  const stored = parseStoredSmsSettings(row?.smsSettings)
  let apiKey = parsed.data.apiKey ?? ''
  if (!apiKey && stored) {
    try { apiKey = decrypt(stored.apiKeyEnc) } catch { apiKey = '' }
  }
  if (!apiKey) return NextResponse.json({ error: 'Collez votre clé API Brevo.' }, { status: 422 })

  // Pausing must work even when Brevo is down or the key was revoked.
  if (!parsed.data.enabled && !parsed.data.apiKey) {
    const paused = toStoredSmsSettings({ enabled: false, sender: parsed.data.sender, apiKey })
    await db.workspace.update({ where: { id: workspace.workspaceId }, data: { smsSettings: paused } })
    return NextResponse.json({ ok: true, settings: publicSmsSettings(paused), smsCredits: null })
  }

  const account = await checkBrevoAccount(apiKey)
  if (!account.ok) {
    const error = account.error === 'AUTH'
      ? 'Brevo refuse cette clé API : vérifiez-la dans Brevo › Paramètres › Clés API.'
      : 'Brevo ne répond pas pour le moment : réessayez dans quelques minutes.'
    return NextResponse.json({ error }, { status: 422 })
  }

  const next = toStoredSmsSettings({ enabled: parsed.data.enabled, sender: parsed.data.sender, apiKey })
  await db.workspace.update({ where: { id: workspace.workspaceId }, data: { smsSettings: next } })
  if (parsed.data.apiKey) {
    await recordAudit(db, workspace, { action: 'api_key.set', target: { type: 'integration', id: 'brevo' }, req })
  }
  return NextResponse.json({ ok: true, settings: publicSmsSettings(next), smsCredits: account.smsCredits })
}

export async function DELETE(req: Request) {
  const workspaceAccess = await session('settings.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const stepUp = await requireStepUp(db, workspace, { deny: { action: 'api_key.removed', target: { type: 'integration', id: 'brevo' }, req } })
  if (stepUp) return stepUp
  await db.workspace.update({ where: { id: workspace.workspaceId }, data: { smsSettings: Prisma.DbNull } })
  await recordAudit(db, workspace, { action: 'api_key.removed', target: { type: 'integration', id: 'brevo' }, req })
  return NextResponse.json({ ok: true, settings: publicSmsSettings(null) })
}
