/**
 * POST /api/ai/generate-sequence
 *
 * Streams a full email sequence generation using the Copywriter Agent.
 * Returns Server-Sent Events (SSE): one event per email step.
 *
 * Request body:
 *   { campaignData: CampaignWizardData }
 *
 * SSE event types:
 *   { type: 'email_start', emailIndex: number, total: number }
 *   { type: 'status', message: string }
 *   { type: 'chunk', text: string }
 *   { type: 'critique', score: number, notes: string, criteria: {...} }
 *   { type: 'email_done', emailIndex: number, subject: string, body: string, score: number, dayOffset: number }
 *   { type: 'invite_note_start', emailIndex: number }
 *   { type: 'invite_note_done', emailIndex: number, inviteNote: string, clamped: boolean }
 *   { type: 'invite_note_failed', emailIndex: number }
 *   { type: 'sequence_done', totalEmails: number }
 *   { type: 'error', message: string }
 */

import { db } from '@/lib/db'
import { parseSignature } from '@/lib/email/signature'
import { toWizardChannel, type WizardChannel } from '@/lib/types/channels'
import { auth } from '@clerk/nextjs/server'
import { generateEmailStream, generateInviteNote } from '@/lib/agents/copywriter'
import { isLlmConfigured } from '@/lib/llm/client'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { checkAiGenerationAllowed } from '@/lib/stripe/quota'
import { limitAll } from '@/lib/security/shared-rate-limit'
import { deduceLanguageFromGeos } from '@/lib/types/campaign-wizard'
import type { CampaignWizardData, MessageLanguage } from '@/lib/types/campaign-wizard'
import type { CopywriterInput } from '@/lib/agents/copywriter'

const MIN_VALUE_PROP_LENGTH = 20

// Day offsets per sequence length
const DAY_OFFSETS: Record<number, number[]> = {
  1: [0],
  2: [0, 4],
  3: [0, 3, 7],
  4: [0, 3, 7, 12],
  5: [0, 3, 7, 12, 18],
}

function getSequenceLength(goal: string): number {
  const lengths: Record<string, number> = {
    leads: 3,
    demos: 3,
    sales: 2,
    awareness: 2,
  }
  return lengths[goal] ?? 3
}

function buildCopywriterInput(
  data: CampaignWizardData,
  emailIndex: number,
  totalEmails: number,
  dayOffset: number,
  channel: WizardChannel = 'email',
  language: MessageLanguage = 'fr',
  sender: { name: string; company: string } = { name: '', company: '' },
): CopywriterInput {
  return {
    campaignName: data.step1.name,
    goal: data.step1.goal,
    industry: data.step1.industry,
    targetTitles: data.step2.targetTitles,
    targetGeos: data.step2.targetGeos,
    tone: data.step3.tone,
    valueProposition: data.step3.valueProposition,
    emailIndex,
    totalEmails,
    dayOffset,
    channel,
    language,
    senderName: sender.name,
    senderCompany: sender.company,
  }
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Session expirée : reconnectez-vous.' }), { status: 401 })
  }

  // ── Plan gate: AI generation requires PRO+ ──────────────────────────────
  // Free users see an UpgradeModal upstream: this is the backend safety net
  // that blocks API direct calls / curl bypass attempts.
  const workspaceAccess = await requireAccess(userId, 'ai.generate')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  // One request can cost dozens of model calls (steps × critique attempts).
  const throttle = await limitAll([
    { key: `user:${workspace.userId}`, opts: { windowSec: 3600, max: 20, scope: 'ai-generate-sequence' } },
    { key: `ws:${workspace.workspaceId}`, opts: { windowSec: 3600, max: 60, scope: 'ai-generate-sequence' } },
  ])
  if (!throttle.allowed) {
    return new Response(JSON.stringify({ error: 'Trop de générations : réessayez dans une heure.' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  }
  if (!checkAiGenerationAllowed(workspace.plan)) {
    return new Response(
      JSON.stringify({
        error:      'La génération IA est incluse à partir de la formule Pro.',
        upgradeUrl: '/dashboard/settings?tab=billing',
        reason:     'ai_generation',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let data: CampaignWizardData
  try {
    const body = await req.json() as { campaignData: CampaignWizardData }
    data = body.campaignData
  } catch {
    return new Response(JSON.stringify({ error: 'Requête invalide.' }), { status: 400 })
  }

  // Without a real offer the copywriter invents one (seen in production).
  const valueProposition = typeof data?.step3?.valueProposition === 'string' ? data.step3.valueProposition.trim() : ''
  if (valueProposition.length < MIN_VALUE_PROP_LENGTH) {
    return new Response(
      JSON.stringify({ error: `Décrivez votre offre (au moins ${MIN_VALUE_PROP_LENGTH} caractères) avant de générer la séquence.` }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!isLlmConfigured()) {
    return new Response(JSON.stringify({ error: 'Génération IA momentanément indisponible. Réessayez plus tard.' }), { status: 503 })
  }

  // The user-designed pipeline (Jour + canal, chosen in the wizard) takes
  // precedence; goal-based all-email defaults remain the legacy fallback.
  const rawPlan = data.step3.sequencePlan
  const plan: Array<{ dayOffset: number; channel: WizardChannel }> =
    Array.isArray(rawPlan) && rawPlan.length > 0 && rawPlan.length <= 7
      ? rawPlan.map((p) => ({
          dayOffset: Math.max(0, Math.min(60, Number(p.dayOffset) || 0)),
          channel:   toWizardChannel(p.channel),
        }))
      : (() => {
          const n = getSequenceLength(data.step1.goal)
          const offsets = DAY_OFFSETS[n] ?? DAY_OFFSETS[3]
          return offsets.slice(0, n).map((d) => ({ dayOffset: d, channel: 'email' as const }))
        })()
  const totalEmails = plan.length

  // Phone steps introduce the sender (the prospect does not know the number).
  const signature = plan.some((p) => p.channel === 'whatsapp' || p.channel === 'sms')
    ? parseSignature((await db.workspace.findUnique({ where: { id: workspace.workspaceId }, select: { emailSignature: true } }))?.emailSignature)
    : null
  const sender = { name: signature?.fullName ?? '', company: signature?.company ?? '' }

  // ONE language per campaign: explicit wizard choice wins, otherwise deduced
  // from the target geos (FR-speaking majority -> fr, else en).
  const language: MessageLanguage =
    data.step3.language === 'en' || data.step3.language === 'fr'
      ? data.step3.language
      : deduceLanguageFromGeos(data.step2.targetGeos ?? [])

  // Create SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      // The FIRST LinkedIn touch is the only step that can go out as a
      // connection request (the lead is not a 1st-degree relation yet), and
      // LinkedIn caps that note at 300 chars. It therefore needs a dedicated
      // second variant. Every later LinkedIn step runs after the invitation was
      // accepted, so it is a plain DM with an 8000-char ceiling.
      const firstLinkedInIndex = plan.findIndex((p) => p.channel === 'linkedin')

      try {
        for (let i = 0; i < totalEmails; i++) {
          const { dayOffset, channel } = plan[i]
          const input = buildCopywriterInput(data, i, totalEmails, dayOffset, channel, language, sender)

          emit({ type: 'email_start', emailIndex: i, total: totalEmails, dayOffset, channel })

          // Stream this email's generation
          const emailStream = generateEmailStream(input)
          for await (const chunk of emailStream) {
            // chunk is already formatted as "data: {...}\n\n"
            // We need to parse and re-emit as structured events
            const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))
            for (const line of lines) {
              try {
                const eventData = JSON.parse(line.slice(6)) as { type: string; subject?: string; body?: string; score?: number; attempts?: number }
                if (eventData.type === 'done') {
                  emit({
                    type: 'email_done',
                    emailIndex: i,
                    subject: eventData.subject,
                    body: eventData.body,
                    score: eventData.score,
                    dayOffset,
                    channel,
                    attempts: eventData.attempts,
                  })
                } else {
                  controller.enqueue(encoder.encode(line + '\n\n'))
                }
              } catch {
                controller.enqueue(encoder.encode(line + '\n\n'))
              }
            }
          }

          // Second variant for the first LinkedIn touch: the ≤300-char note.
          // A failure here must never sink the whole sequence: the sender
          // falls back to a safely-fitted body when the note is missing.
          if (i === firstLinkedInIndex) {
            emit({ type: 'invite_note_start', emailIndex: i })
            try {
              const { note, clamped } = await generateInviteNote(input)
              emit({ type: 'invite_note_done', emailIndex: i, inviteNote: note, clamped })
            } catch (err) {
              console.error('[generate-sequence] invite note failed', err)
              emit({ type: 'invite_note_failed', emailIndex: i })
            }
          }
        }

        emit({ type: 'sequence_done', totalEmails })
      } catch (error) {
        // Provider errors are English and technical: log them, show a sentence.
        console.error('[generate-sequence] failed:', error instanceof Error ? error.message : String(error))
        emit({ type: 'error', message: 'La génération a échoué. Réessayez dans un instant.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
