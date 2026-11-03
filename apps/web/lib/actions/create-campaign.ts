/**
 * Campaign creation from the wizard (POST /api/campaigns).
 *
 * Moved from the former server action app/(dashboard)/dashboard/campaigns/actions.ts.
 * The route authenticates with Clerk and passes the access check to run
 * (requireAccess 'campaign.write' on the active workspace); it is called at
 * the same point as before, after the rate limit and the validation.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { DELETION_PENDING_MESSAGE, deletionPending } from '@/lib/privacy/workspace-deletion'
import { checkCampaignQuota, checkEmailStepsQuota } from '@/lib/stripe/quota'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { limit } from '@/lib/security/shared-rate-limit'
import { LINKEDIN_LIMITS, inviteNoteFits } from '@/lib/multichannel/linkedin-limits'
import { inngest, LEAD_PIPELINE_EVENT } from '@/lib/inngest/client'
import type { AccessResult } from '@/lib/auth/access'
import { trackServer, flushServerEvents } from '@/lib/analytics/server-events'
import { queueFirstStep } from '@/lib/sequences/queue-first-step'
import { kickEmailDrip } from '@/lib/inngest/email-drip'
import { toDbChannel } from '@/lib/types/channels'
import { validateSenderChoice } from '@/lib/email/mailbox-access'

// Derive transaction client type from db to avoid importing ungenerated @prisma/client
type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// ─── Validation ───────────────────────────────────────────────────────────────

const emailStepSchema = z.object({
  dayOffset: z.number().int().min(0),
  channel: z.enum(['EMAIL', 'LINKEDIN', 'WHATSAPP', 'SMS']).default('EMAIL'),
  // LinkedIn DMs carry no subject: required for EMAIL steps only (refine below).
  subject: z.string().max(200),
  body: z.string().min(1),
  // LinkedIn first contact only: the ≤300-char connection-request note.
  inviteNote: z.string().optional(),
  isAiGenerated: z.boolean(),
}).refine((s) => s.channel !== 'EMAIL' || s.subject.trim().length > 0, {
  message: 'Sujet requis pour les emails',
  path: ['subject'],
}).refine((s) => !s.inviteNote || inviteNoteFits(s.inviteNote), {
  // Validated on the RENDERED length: {{firstName}} is 13 chars in the template
  // but becomes a real name at send time. LinkedIn rejects nothing, it silently
  // truncates, so the campaign must never be launchable with an oversized note.
  message: `Note d'invitation trop longue (LinkedIn limite à ${LINKEDIN_LIMITS.INVITE_NOTE_MAX} caractères une fois les variables remplacées)`,
  path: ['inviteNote'],
})

const createCampaignSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  goal: z.enum(['LEADS', 'DEMOS', 'SALES', 'AWARENESS']),
  targetIndustry: z.string().optional(),
  targetTitles: z.array(z.string()).default([]),
  targetCompanySizes: z.array(z.enum(['XS', 'S', 'M', 'L', 'XL'])).default([]),
  targetGeos: z.array(z.string()).default([]),
  excludedDomains: z.string().optional(),
  tone: z.enum(['PROFESSIONAL', 'CASUAL', 'BOLD', 'CONSULTATIVE']).default('PROFESSIONAL'),
  valueProposition: z.string().optional(),
  leadSource: z.enum(['AI_PROSPECTING', 'CSV_IMPORT', 'MANUAL']).default('AI_PROSPECTING'),
  estimatedLeads: z.number().int().min(0).default(0),
  emailSteps: z.array(emailStepSchema)
    .min(1, 'Ajoutez au moins un message à la séquence')
    // The first step starts the sequence for every lead at launch: it must be
    // one Phantera sends (a WhatsApp/SMS step waits for the user).
    .refine((steps) => steps[0]?.channel !== 'WHATSAPP' && steps[0]?.channel !== 'SMS', {
      message: 'Le premier message doit être un email ou un message LinkedIn : WhatsApp et SMS viennent en relance.',
    }),
  // "Base existante": leads picked in the wizard, attached at creation.
  leadIds: z.array(z.string().min(1)).max(1000).default([]),
}).refine(
  // The CSV option of the wizard never uploaded anything; refuse it rather
  // than create an empty campaign.
  (data) => data.leadSource !== 'CSV_IMPORT',
  { message: "L'import CSV n'est pas disponible : choisissez la prospection IA ou vos leads existants.", path: ['leadSource'] },
).refine(
  (data) => data.leadSource !== 'MANUAL' || data.leadIds.length > 0,
  { message: 'Sélectionnez au moins un lead de votre base.', path: ['leadIds'] },
).refine(
  // Pipeline auto-prospecting needs at least one job title: otherwise Apollo
  // returns 0 leads and the user ends up with an empty campaign.
  (data) => data.leadSource !== 'AI_PROSPECTING' || data.targetTitles.length > 0,
  { message: 'Au moins un titre de poste cible est requis pour la prospection IA', path: ['targetTitles'] },
)

// ─── Request shape ─────────────────────────────────────────────────────────────

/**
 * The wizard as the front sends it (CampaignWizardData, the parts read here).
 * Only the shape is checked: the business rules are createCampaignSchema's,
 * applied after mapping. Unknown keys are ignored. Mirrors the contract
 * (packages/contract/src/endpoints/campaigns.ts, campaigns.create).
 */
export const campaignWizardSchema = z.object({
  step1: z.object({
    name: z.string(),
    goal: z.enum(['leads', 'demos', 'sales', 'awareness']),
    industry: z.string(),
  }),
  step2: z.object({
    targetTitles: z.array(z.string()),
    targetCompanySizes: z.array(z.enum(['XS', 'S', 'M', 'L', 'XL'])),
    targetGeos: z.array(z.string()),
    excludedDomains: z.string(),
  }),
  step3: z.object({
    tone: z.enum(['professional', 'casual', 'bold', 'consultative']),
    valueProposition: z.string(),
    emailSteps: z.array(z.object({
      dayOffset: z.number(),
      channel: z.enum(['email', 'linkedin', 'whatsapp', 'sms']).optional(),
      subject: z.string(),
      body: z.string(),
      inviteNote: z.string().optional(),
      isAiGenerated: z.boolean(),
    })),
  }),
  step4: z.object({
    leadSource: z.enum(['ai', 'csv', 'manual']),
    estimatedLeads: z.number(),
    leadIds: z.array(z.string()).optional(),
    mailboxId: z.string().nullable().optional(),
    fromAlias: z.string().nullable().optional(),
  }),
})

export type CampaignWizardInput = z.infer<typeof campaignWizardSchema>

// ─── Map wizard data to DB schema ─────────────────────────────────────────────

function mapWizardToSchema(data: CampaignWizardInput) {
  const goalMap: Record<string, 'LEADS' | 'DEMOS' | 'SALES' | 'AWARENESS'> = {
    leads: 'LEADS',
    demos: 'DEMOS',
    sales: 'SALES',
    awareness: 'AWARENESS',
  }
  const toneMap: Record<string, 'PROFESSIONAL' | 'CASUAL' | 'BOLD' | 'CONSULTATIVE'> = {
    professional: 'PROFESSIONAL',
    casual: 'CASUAL',
    bold: 'BOLD',
    consultative: 'CONSULTATIVE',
  }
  const sourceMap: Record<string, 'AI_PROSPECTING' | 'CSV_IMPORT' | 'MANUAL'> = {
    ai: 'AI_PROSPECTING',
    csv: 'CSV_IMPORT',
    manual: 'MANUAL',
  }

  return {
    name: data.step1.name,
    goal: goalMap[data.step1.goal] ?? 'LEADS',
    targetIndustry: data.step1.industry || undefined,
    targetTitles: data.step2.targetTitles,
    targetCompanySizes: data.step2.targetCompanySizes as Array<'XS' | 'S' | 'M' | 'L' | 'XL'>,
    targetGeos: data.step2.targetGeos,
    excludedDomains: data.step2.excludedDomains || undefined,
    tone: toneMap[data.step3.tone] ?? 'PROFESSIONAL',
    valueProposition: data.step3.valueProposition || undefined,
    leadSource: sourceMap[data.step4.leadSource] ?? 'AI_PROSPECTING',
    estimatedLeads: data.step4.estimatedLeads,
    leadIds: data.step4.leadSource === 'manual' ? (data.step4.leadIds ?? []) : [],
    emailSteps: data.step3.emailSteps.map((step, i) => ({
      dayOffset: step.dayOffset,
      channel: toDbChannel(step.channel),
      subject: step.subject,
      body: step.body,
      // Only meaningful on LinkedIn steps; ignored elsewhere.
      inviteNote: step.channel === 'linkedin' ? step.inviteNote : undefined,
      isAiGenerated: step.isAiGenerated,
    })),
  }
}

// ─── Create ────────────────────────────────────────────────────────────

export type CreateCampaignResult =
  | { success: true; campaignId: string; workspaceId: string }
  | { success: false; error: string; status: number }

export async function createCampaign(
  clerkId: string,
  wizardData: CampaignWizardInput,
  authorize: () => Promise<AccessResult>,
): Promise<CreateCampaignResult> {

  // Block rapid double-submit: max 2 campaign creations per 10s per user.
  // Even with UI disable-on-click, a script / network retry can still POST twice.
  const rl = await limit(`user:${clerkId}`, { windowSec: 10, max: 2, scope: 'campaign:create' })
  if (!rl.allowed) {
    return { success: false, error: 'Trop de tentatives : patientez quelques secondes avant de réessayer.', status: 429 }
  }

  // Map wizard data to DB-compatible format
  const mapped = mapWizardToSchema(wizardData)

  // Validate
  const parsed = createCampaignSchema.safeParse(mapped)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données de campagne invalides.',
      status: 422,
    }
  }

  try {
    // The active workspace, with the right to create campaigns in it.
    const access = await authorize()
    if (!access.ok) return { success: false, error: access.error, status: access.status }

    const workspaceId = access.ctx.workspaceId
    if (await deletionPending(db, workspaceId)) return { success: false, error: DELETION_PENDING_MESSAGE, status: 409 }

    // ── Plan quota enforcement ───────────────────────────────────────────────
    const campaignQuota = await checkCampaignQuota(workspaceId)
    if (!campaignQuota.allowed) {
      const planName = PLAN_CONFIG[campaignQuota.planName as keyof typeof PLAN_CONFIG]?.name ?? campaignQuota.planName
      return {
        success: false,
        error: `Limite atteinte : votre plan ${planName} autorise ${campaignQuota.limit} campagne${campaignQuota.limit > 1 ? 's' : ''}. Passez au plan Pro pour des campagnes illimitées.`,
        status: 402,
      }
    }

    // Fetch workspace plan for email steps check
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true },
    })
    const stepsQuota = checkEmailStepsQuota(workspace?.plan ?? 'FREE', parsed.data.emailSteps.length)
    if (!stepsQuota.allowed) {
      return {
        success: false,
        error: `Trop d'emails : votre plan autorise ${stepsQuota.limit} email${stepsQuota.limit > 1 ? 's' : ''} par séquence. Passez au plan Pro pour jusqu'à 5 emails.`,
        status: 402,
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // « Envoyer depuis »: a mailbox of this workspace that serves the creator
    // (theirs or shared), connected, and one of its aliases: checked here,
    // never trusted from the browser.
    const ownerUserId = access.ctx.userId
    const sender = await validateSenderChoice(db, { workspaceId, ownerUserId }, {
      mailboxId: wizardData.step4.mailboxId,
      fromAlias: wizardData.step4.fromAlias,
    })
    if (!sender.ok) return { success: false, error: sender.error, status: 422 }

    const { emailSteps, leadIds, ...campaignData } = parsed.data
    const fromExistingBase = campaignData.leadSource === 'MANUAL'

    // Create campaign + email steps in a transaction.
    // The outer checkCampaignQuota above is check-then-create (a race: two
    // concurrent requests could both pass it on a limited plan). We re-verify
    // the count INSIDE a Serializable transaction so the database serialises
    // conflicting creates: the limit can never be exceeded.
    const campaign = await db.$transaction(async (tx: TransactionClient) => {
      if (campaignQuota.limit !== Infinity) {
        const liveCount = await tx.campaign.count({
          where: { workspaceId, status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
        })
        if (liveCount >= campaignQuota.limit) {
          throw new Error('QUOTA_CAMPAIGN')
        }
      }

      // A campaign on existing leads becomes ACTIVE once its first messages
      // are queued (below); until then it stays a draft, not an empty
      // "active" campaign.
      const created = await tx.campaign.create({
        data: {
          ...campaignData,
          workspaceId,
          ownerUserId,
          connectedMailboxId: sender.mailboxId,
          fromAlias:          sender.fromAlias,
          status: fromExistingBase ? 'DRAFT' : 'ACTIVE',
        },
      })

      if (fromExistingBase) {
        // Only this workspace's leads that are still free (the shared pool,
        // which every member sees): a lead picked in another tab meanwhile
        // stays where it is.
        await tx.lead.updateMany({
          where: { id: { in: leadIds }, workspaceId, campaignId: null },
          data:  { campaignId: created.id },
        })
      }

      await tx.campaignEmailStep.createMany({
        data: emailSteps.map((step, i) => ({
          campaignId: created.id,
          position: i,
          dayOffset: step.dayOffset,
          channel: step.channel,
          subject: step.subject,
          body: step.body,
          inviteNote: step.inviteNote ?? null,
          isAiGenerated: step.isAiGenerated,
        })),
      })

      return created
    }, { isolationLevel: 'Serializable' })

    // ── Existing base: queue the first message, as the launch button does ───
    if (fromExistingBase) {
      try {
        const queued = await queueFirstStep(db, { workspaceId, campaignId: campaign.id })
        if (queued.ok) {
          await db.campaign.update({ where: { id: campaign.id }, data: { status: 'ACTIVE' } })
          await kickEmailDrip(`create:${campaign.id}`)
        } else {
          console.warn(`[createCampaign] existing-base campaign left as draft campaignId=${campaign.id}: ${queued.reason}`)
        }
      } catch (err) {
        console.error('[createCampaign] queueing failed:', err instanceof Error ? err.message : String(err))
      }
    }

    // ── Kick off AI prospecting as a DURABLE background job ──────────────────
    // Fired server-side via Inngest (not a client SSE fetch): runs decoupled
    // from this request: no Vercel timeout, retries, observable. The wizard
    // simply redirects; the user is notified when prospecting finishes.
    if (parsed.data.leadSource === 'AI_PROSPECTING' && parsed.data.targetTitles.length > 0) {
      const limit = Math.max(10, Math.min(parsed.data.estimatedLeads || 25, 1000))
      try {
        const sent = await inngest.send({
          name: LEAD_PIPELINE_EVENT,
          data: {
            workspaceId,
            campaignId:   campaign.id,
            jobTitles:    parsed.data.targetTitles,
            industry:     parsed.data.targetIndustry,
            companySizes: parsed.data.targetCompanySizes,
            country:      parsed.data.targetGeos[0],
            limit,
          },
        })
        // Loud success log: if the event reached Inngest Cloud we get back ids.
        // If you see this but nothing runs in Inngest -> the app isn't synced or
        // the `lead-pipeline` function isn't registered (re-sync after deploy).
        console.log('[createCampaign] lead pipeline queued', JSON.stringify({
          campaignId: campaign.id,
          eventIds:   sent.ids,
          hasEventKey: !!process.env.INNGEST_EVENT_KEY,
        }))
      } catch (err) {
        // Don't fail campaign creation if the event can't be queued: but log
        // LOUDLY so the cause is visible (almost always: INNGEST_EVENT_KEY
        // missing in prod, or the Inngest app not connected).
        console.error('[createCampaign] failed to queue lead pipeline:', JSON.stringify({
          message:     err instanceof Error ? err.message : String(err),
          hasEventKey: !!process.env.INNGEST_EVENT_KEY,
        }))
      }
    }

    revalidatePath('/dashboard/campaigns')
    revalidatePath('/dashboard')

    // Activation milestone, once per workspace. Analytics must never fail
    // the creation, and the event is flushed before the function freezes.
    try {
      const campaignsOfWorkspace = await db.campaign.count({ where: { workspaceId } })
      if (campaignsOfWorkspace === 1) {
        trackServer(clerkId, 'first_campaign_created', { workspaceId, campaignId: campaign.id, goal: wizardData.step1.goal })
        await flushServerEvents()
      }
    } catch (err) {
      console.error('[createCampaign] analytics failed:', err instanceof Error ? err.message : String(err))
    }

    return { success: true, campaignId: campaign.id, workspaceId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create campaign'

    // Atomic quota re-check tripped (race lost): return the friendly limit message.
    if (message === 'QUOTA_CAMPAIGN') {
      return {
        success: false,
        error: 'Limite de campagnes atteinte pour votre plan. Passez à un plan supérieur pour en créer davantage.',
        status: 402,
      }
    }
    // Serializable conflict (two creates raced): ask the user to retry.
    if (message.includes('could not serialize') || (err as { code?: string })?.code === 'P2034') {
      return {
        success: false,
        error: 'Création simultanée détectée : réessayez dans un instant.',
        status: 409,
      }
    }
    console.error('[createCampaign] failed:', message)
    return { success: false, error: "La campagne n'a pas pu être créée. Réessayez dans un instant.", status: 500 }
  }
}

