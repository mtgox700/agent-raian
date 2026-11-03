/**
 * Editing a sequence step (PATCH /api/campaigns/steps/[stepId]).
 *
 * Moved from the former server action app/(dashboard)/dashboard/campaigns/actions.ts.
 * The route authenticates with Clerk and passes the access check to run on
 * the step's workspace (requireAccess 'campaign.write'), once the step is known.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { LINKEDIN_LIMITS, inviteNoteFits } from '@/lib/multichannel/linkedin-limits'
import type { AccessResult } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { SENT_STATUSES } from '@/lib/sequences/types'

// ─── Edit a campaign email step (only if not yet sent) ─────────────────────────

export const updateStepSchema = z.object({
  stepId:    z.string().min(1),
  subject:   z.string().min(1, 'Sujet requis').max(200).optional(),
  body:      z.string().min(1, 'Corps requis').optional(),
  dayOffset: z.number().int().min(0).max(60).optional(),
  // LinkedIn connection-request note. Validated on the RENDERED length, since
  // LinkedIn truncates silently rather than rejecting an oversized note.
  inviteNote: z.string().refine(inviteNoteFits, {
    message: `Note d'invitation trop longue (LinkedIn limite à ${LINKEDIN_LIMITS.INVITE_NOTE_MAX} caractères une fois les variables remplacées)`,
  }).optional(),
})

export type UpdateStepInput = z.infer<typeof updateStepSchema>

/**
 * Updates a sequence step's subject / body / send-delay. Allowed while some
 * lead has not received it yet; the change applies to those leads only.
 * Step 1 (position 0) keeps J+0.
 */
export type UpdateStepResult = { success: true } | { success: false; error: string; status: number }

export async function updateCampaignStep(
  input: unknown,
  authorize: (workspaceId: string) => Promise<AccessResult>,
): Promise<UpdateStepResult> {
  const parsed = updateStepSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides', status: 422 }
  }
  const { stepId, subject, body, dayOffset, inviteNote } = parsed.data

  // Load step -> campaign -> verify ownership
  const step = await db.campaignEmailStep.findUnique({
    where:  { id: stepId },
    select: { id: true, position: true, campaignId: true, campaign: { select: { workspaceId: true } } },
  })
  if (!step) return { success: false, error: 'Étape introuvable', status: 404 }

  const access = await authorize(step.campaign.workspaceId)
  if (!access.ok) return { success: false, error: access.error, status: access.status }
  // Another member's campaign answers like a missing one.
  const own = await db.campaign.count({ where: { id: step.campaignId, ...campaignScope(access.ctx) } })
  if (own === 0) return { success: false, error: 'Étape introuvable', status: 404 }

  // Queued sends read the step at send time, so an edit reaches every lead
  // not contacted yet. It is refused only once nobody is left to receive it:
  // blocking at the first send made a typo unfixable for hundreds of leads.
  const [alreadySent, stillQueued] = await Promise.all([
    db.emailSend.count({ where: { emailStepId: stepId, status: { in: [...SENT_STATUSES] } } }),
    db.emailSend.count({ where: { emailStepId: stepId, status: 'PENDING' } }),
  ])
  if (alreadySent > 0 && stillQueued === 0) {
    return { success: false, error: 'Cet email a déjà été envoyé à tous les leads de la campagne : il ne peut plus être modifié.', status: 409 }
  }

  // Step 1 is always immediate (J+0): ignore any dayOffset change for it.
  const data: { subject?: string; body?: string; dayOffset?: number; inviteNote?: string } = {}
  if (subject !== undefined)    data.subject = subject
  if (body !== undefined)       data.body = body
  if (inviteNote !== undefined) data.inviteNote = inviteNote
  if (dayOffset !== undefined && step.position > 0) data.dayOffset = dayOffset

  if (Object.keys(data).length === 0) return { success: true }

  try {
    await db.campaignEmailStep.update({ where: { id: stepId }, data })
    revalidatePath(`/dashboard/campaigns/${step.campaignId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Échec de la mise à jour', status: 500 }
  }
}
