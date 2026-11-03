/**
 * POST /api/leads/manual
 *
 * Creates a single lead manually (e.g. for testing email sending).
 * Sets scoreBadge to FAST_TRACK by default so the lead is eligible
 * for campaign launch immediately.
 *
 * Body: { workspaceId, firstName, lastName, email, company?, title?,
 *         industry?, campaignId?, scoreBadge? }
 */

import { auth } from '@clerk/nextjs/server'
import { MANUAL_REASON } from '@/lib/leads/rescore'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { optedOut } from '@/lib/privacy/opt-out'
import { queueFirstStep } from '@/lib/sequences/queue-first-step'
import { kickEmailDrip } from '@/lib/inngest/email-drip'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { campaignScope, leadScope } from '@/lib/auth/scope'
import { trackServer, flushServerEvents } from '@/lib/analytics/server-events'

const manualLeadSchema = z.object({
  workspaceId: z.string().min(1),
  firstName:   z.string().min(1).max(100).trim(),
  lastName:    z.string().min(1).max(100).trim(),
  // Normalize to lowercase to make the (workspaceId, email) unique constraint
  // case-insensitive: prevents storing both "John@x.com" and "john@x.com".
  email:       z.string().email('Email invalide').trim().toLowerCase(),
  company:     z.string().max(200).trim().optional(),
  title:       z.string().max(200).trim().optional(),
  industry:    z.string().max(200).trim().optional(),
  // Optional profile links: enables manual LinkedIn-workflow testing.
  linkedinUrl: z.string().trim().max(300)
    .refine((v) => /linkedin\.com\/in\/[^/?#]+/i.test(v), 'URL LinkedIn invalide (attendu: linkedin.com/in/…)')
    .optional().or(z.literal('').transform(() => undefined)),
  website:     z.string().trim().max(300).optional().or(z.literal('').transform(() => undefined)),
  campaignId:  z.string().optional(),
  scoreBadge:  z.enum(['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP']).default('FAST_TRACK'),
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
  }

  const parsed = manualLeadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation échouée' },
      { status: 422 }
    )
  }

  const { workspaceId, firstName, lastName, email, company, title, industry, linkedinUrl, website, campaignId, scoreBadge } = parsed.data

  // Verify workspace belongs to this user
  const workspaceAccess = await requireAccess(userId, 'lead.write', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // The campaign (if provided) must be one the caller runs, or sees as admin
  let campaignActive = false
  if (campaignId) {
    const campaign = await db.campaign.findFirst({
      where: { id: campaignId, ...campaignScope(workspace) },
      select: { id: true, status: true },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
    }
    campaignActive = campaign.status === 'ACTIVE'
  }

  // A person who objected to this workspace cannot be added back by hand.
  if ((await optedOut(db, workspaceId, [email])).size > 0) {
    return NextResponse.json({ error: 'Ce contact s’est opposé à être contacté par votre espace : il ne peut pas être ajouté.', code: 'OPTED_OUT' }, { status: 409 })
  }

  // The same address already followed in a colleague's campaign stays theirs:
  // the upsert below would otherwise move it and return their data.
  const existing = await db.lead.findUnique({ where: { workspaceId_email: { workspaceId, email } }, select: { id: true } })
  if (existing) {
    const visible = await db.lead.count({ where: { AND: [{ id: existing.id }, leadScope(workspace)] } })
    if (visible === 0) {
      return NextResponse.json({ error: 'Ce contact est déjà suivi par un autre membre de l’espace.' }, { status: 409 })
    }
  }

  try {
    const lead = await db.lead.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: {
        workspaceId,
        campaignId:  campaignId ?? null,
        firstName,
        lastName,
        email,
        company:     company  ?? null,
        title:       title    ?? null,
        industry:    industry ?? null,
        linkedinUrl: linkedinUrl ?? null,
        website:     website ?? null,
        source:      'MANUAL',
        // The user chose the priority: no made-up score next to it (a SKIP
        // stored with 30 showed a NURTURE gauge). Status stays 'new' until a
        // message is really sent.
        scoreBadge,
        aiScore:     null,
        scoreReason: MANUAL_REASON,
        status:      'new',
      },
      update: {
        // If lead already exists, update campaign association if provided
        ...(campaignId ? { campaignId } : {}),
        firstName,
        lastName,
        company:    company  ?? null,
        title:      title    ?? null,
        industry:   industry ?? null,
        // Only overwrite links when explicitly provided (keep enriched data).
        ...(linkedinUrl ? { linkedinUrl } : {}),
        ...(website ? { website } : {}),
        // Badge, score and reason change together: an old 15/100 next to a
        // new Fast Track badge contradicted itself.
        scoreBadge,
        aiScore:     null,
        scoreReason: MANUAL_REASON,
      },
      include: { enrichment: true },
    })

    // Added to a running campaign: the first message goes out like for every
    // other lead of that campaign, instead of waiting for a relaunch.
    if (campaignId && campaignActive) {
      try {
        const queued = await queueFirstStep(db, { workspaceId, campaignId, leadIds: [lead.id] })
        if (queued.ok) await kickEmailDrip(`manual:${campaignId}`)
      } catch (err) {
        console.error(`[leads/manual] queueing failed campaignId=${campaignId}:`, err instanceof Error ? err.message : String(err))
      }
    }

    // ── Analytics: activation milestone (lead saved) ──
    trackServer(userId, 'first_lead_saved', {
      workspaceId,
      source: 'manual',
    })
    await flushServerEvents()

    return NextResponse.json({
      success: true,
      data: {
        ...lead,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        enrichment: lead.enrichment
          ? {
              emailVerified:   lead.enrichment.emailVerified,
              emailConfidence: lead.enrichment.emailConfidence,
              emailStatus:     lead.enrichment.emailStatus,
            }
          : null,
      },
    })
  } catch (err) {
    console.error('[leads/manual] save failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Le lead n'a pas pu être enregistré. Réessayez." }, { status: 500 })
  }
}
