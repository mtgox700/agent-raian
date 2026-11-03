/**
 * PATCH /api/leads/[leadId]/status
 * Updates a lead's status and/or its "ne plus contacter" flag. Validates
 * ownership via workspace membership.
 * Body: { status?: "new" | "contacted" | "qualified" | "converted" | "lost", doNotContact?: boolean }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { updateLeadStatus } from '@/lib/repositories/leads.repository'

export const runtime = 'nodejs'

const bodySchema = z.object({
  status:       z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).optional(),
  doNotContact: z.boolean().optional(),
}).refine((b) => b.status !== undefined || b.doNotContact !== undefined, { message: 'Aucune modification' })

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'lead.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  try {
    const updated = await updateLeadStatus(leadId, workspace, body.status, body.doNotContact)
    if (!updated) return NextResponse.json({ error: 'Lead introuvable.' }, { status: 404 })
    return NextResponse.json({ ok: true, lead: updated })
  } catch (err) {
    console.error('[lead-status] Update failed:', err)
    return NextResponse.json({ error: "Le lead n'a pas pu être mis à jour. Réessayez." }, { status: 500 })
  }
}
