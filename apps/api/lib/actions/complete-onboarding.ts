/**
 * First-run setup of the signed-in account (POST /api/onboarding/complete).
 *
 * Moved from the former server action app/(auth)/onboarding/actions.ts. The
 * route authenticates with Clerk and hands the Clerk id here.
 */

import { currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifiedPrimaryEmail } from '@/lib/auth/verified-email'
import { trackServer, flushServerEvents } from '@/lib/analytics/server-events'

// ─── Validation schema ────────────────────────────────────────────────────────
export const onboardingSchema = z.object({
  workspaceName: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(50, 'Workspace name must be 50 characters or less')
    .trim(),
  targetIndustry: z.string().min(1, 'Please select an industry').optional(),
  targetCompanySize: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional(),
  sendingDomain: z
    .string()
    .regex(
      /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Please enter a valid domain (e.g. company.com)'
    )
    .optional()
    .or(z.literal('')),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>

export type OnboardingResult =
  | { success: true }
  | { success: false; error: string; status: number }

export async function completeOnboarding(clerkId: string, input: unknown): Promise<OnboardingResult> {
  // Validate input
  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? 'Validation failed',
      status: 422,
    }
  }

  const { workspaceName, targetIndustry, targetCompanySize, sendingDomain } =
    parsed.data

  try {
    // The account is identified by the VERIFIED primary address only.
    const clerkUser = await currentUser()
    const email = verifiedPrimaryEmail(clerkUser)
    if (!email) {
      return { success: false, error: 'Vérifiez d’abord votre adresse e-mail, puis réessayez.', status: 403 }
    }

    // An address already held by another account is never moved to this one
    // here: that would hand its workspaces over. The Clerk webhook deletes the
    // row of a deleted account, so a recreated account starts clean.
    const existingByEmail = await db.user.findUnique({ where: { email } })
    if (existingByEmail && existingByEmail.clerkId !== clerkId) {
      console.warn('[onboarding] address already linked to another account; not relinked')
      return { success: false, error: 'Cette adresse est déjà liée à un autre compte Phantera. Contactez le support.', status: 409 }
    }

    const user = await db.user.upsert({
      where: { clerkId },
      create: { clerkId, email },
      update: {},
      include: { ownedWorkspaces: true },
    })

    // Upsert the default workspace
    let workspace = user.ownedWorkspaces[0]
    if (!workspace) {
      workspace = await db.workspace.create({
        data: {
          name: workspaceName,
          ownerId: user.id,
          members: {
            create: { userId: user.id, role: 'OWNER' },
          },
        },
      })
    }

    // Update workspace with onboarding data
    await db.workspace.update({
      where: { id: workspace.id },
      data: {
        name: workspaceName,
        targetIndustry: targetIndustry ?? null,
        targetCompanySize: targetCompanySize ?? null,
        sendingDomain: sendingDomain || null,
        onboardingCompleted: true,
      },
    })

    // ── Analytics: activation milestone ──
    trackServer(clerkId, 'onboarding_completed', {
      workspaceId: workspace.id,
      industry:    targetIndustry,
      companySize: targetCompanySize,
    })
    await flushServerEvents()

    revalidatePath('/dashboard', 'layout')
    return { success: true as const }
  } catch {
    return {
      success: false as const,
      error: 'Failed to save workspace settings. Please try again.',
      status: 500,
    }
  }
}
