/**
 * PATCH /api/leads/[leadId]/phone: sets or clears the lead's professional
 * phone. Body: { phone: string } (international form; "" clears it).
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { leadScope } from '@/lib/auth/scope'
import { normalizePhone } from '@/lib/phone/phone'

export const runtime = 'nodejs'

const bodySchema = z.object({ phone: z.string().max(30) })

export async function PATCH(req: Request, { params }: { params: Promise<{ leadId: string }> }): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const workspaceAccess = await requireAccess(userId, 'lead.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  const raw = parsed.data.phone.trim()
  const phone = raw === '' ? null : normalizePhone(raw)
  if (raw !== '' && !phone) {
    return NextResponse.json({ error: 'Saisissez le numéro au format international, ex. +33 6 12 34 56 78.' }, { status: 422 })
  }

  const { leadId } = await params
  const res = await db.lead.updateMany({
    where: { AND: [{ id: leadId }, leadScope(workspace)] },
    data:  { phone, phoneSource: phone ? 'MANUAL' : null },
  })
  if (res.count === 0) return NextResponse.json({ error: 'Lead introuvable.' }, { status: 404 })
  return NextResponse.json({ ok: true, phone })
}
