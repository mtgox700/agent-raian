/**
 * Phantera: Lead pipeline as a durable Inngest function.
 *
 * Triggered by LEAD_PIPELINE_EVENT when a campaign is launched with AI
 * prospecting. Runs the collection+scoring core in a durable step (decoupled
 * from the user request: no Vercel single-request timeout, automatic retries,
 * fully observable in the Inngest dashboard), then DELEGATES email sending to
 * the existing durable `campaignProcessor` (idempotent, rate-limited).
 *
 * Finally notifies the user that prospecting finished.
 */

import { inngest, LEAD_PIPELINE_EVENT } from './client'
import { db } from '@/lib/db'
import {
  collectAndSaveLeads, verifyLeadsChunk, scoreSavedLeads,
  type LeadPipelineParams, type LeadPipelineResult,
} from '@/lib/pipeline/run-lead-pipeline'
import { splitQualifiedByDeliverability, sendStep1ToLeads } from '@/lib/pipeline/send-campaign-step1'
import { createNotification } from '@/lib/services/notifications.service'
import type { StepLike } from './functions'

// ── Handler (testable with a fake step) ──────────────────────────────────────

export async function leadPipelineHandler(
  { event, step }: { event: { data: LeadPipelineParams }; step: StepLike },
): Promise<{ saved: number; sent: number; uncertain: number }> {
  const params = event.data

  // 1. Collect -> enrich -> save. Verify and score run as SEPARATE steps below:
  //    the monolithic step exceeded Vercel's 300s limit when Hunter verification
  //    timed out, killing scoring + sending after leads were saved (2026-07-11).
  const collect = await step.run('collect-save', () => collectAndSaveLeads(params))

  // 1b. Verify deliverability in chunks: one durable step per chunk so a slow
  //     Hunter run only costs its own chunk, never the whole function budget.
  const VERIFY_CHUNK = 20
  let verified = 0
  for (let i = 0; i < collect.savedLeadIds.length; i += VERIFY_CHUNK) {
    const chunk = collect.savedLeadIds.slice(i, i + VERIFY_CHUNK)
    verified += await step.run(`verify-${i}`, () => verifyLeadsChunk(chunk, collect.extras))
  }

  // 1c. Score against the ICP (own step).
  const distribution = await step.run('score', () => scoreSavedLeads(params, collect.savedLeadIds))

  const result: LeadPipelineResult = {
    candidates: collect.candidates, saved: collect.saved, duplicates: collect.duplicates,
    verified, distribution, savedLeadIds: collect.savedLeadIds,
    quotaHit: collect.quotaHit, error: collect.error,
  }

  let sent = 0
  let uncertain = 0

  if (params.campaignId && result.savedLeadIds.length > 0) {
    const campaignId = params.campaignId

    // 2. Split qualified leads into deliverable vs uncertain-email.
    const split = await step.run('split-deliverability', () =>
      splitQualifiedByDeliverability(db, campaignId, result.savedLeadIds),
    )
    uncertain = split.uncertainIds.length

    // 3. Auto-send step 1 ONLY to deliverable leads (protects sender reputation:
    //    uncertain emails are held, not blocked: the user decides below).
    //    Queued in one step; the sending queue delivers them at the mailbox's
    //    own rhythm, so this function never waits on email providers.
    if (split.campaignActive && split.firstStepId && split.deliverableIds.length > 0) {
      const firstStepId = split.firstStepId
      const r = await step.run('queue-step-1', () =>
        sendStep1ToLeads(db, { workspaceId: params.workspaceId, campaignId, firstStepId, leadIds: split.deliverableIds }),
      )
      sent += r.queued
    }

    // 4. If some emails are uncertain, ASK the user (not a silent block).
    if (uncertain > 0) {
      await step.run('notify-uncertain', () => notifyUncertain(params, campaignId, uncertain))
    }
  }

  // 5. Notify prospecting is done (or why it found nothing).
  await step.run('notify', () => notifyDone(params, result, sent))

  return { saved: result.saved, sent, uncertain }
}

async function notifyUncertain(params: LeadPipelineParams, campaignId: string, count: number): Promise<void> {
  await createNotification({
    workspaceId: params.workspaceId,
    type:        'CAMPAIGN_COMPLETED',
    title:       `${count} lead${count > 1 ? 's' : ''} avec email incertain`,
    body:        `Leur adresse n'a pas pu être vérifiée : on ne les a pas contactés pour protéger ta délivrabilité. Veux-tu les contacter quand même ? Ouvre la campagne pour décider.`,
    campaignId,
    data:        { uncertain: count, action: 'contact_uncertain' },
  })
}

async function notifyDone(params: LeadPipelineParams, result: LeadPipelineResult, sent: number): Promise<void> {
  const fastTrack = result.distribution.FAST_TRACK ?? 0
  const setAside = (result.distribution.NURTURE ?? 0) + (result.distribution.SKIP ?? 0) + (result.distribution.UNSCORED ?? 0)
  const unscored = result.distribution.UNSCORED ?? 0
  if (result.saved > 0) {
    await createNotification({
      workspaceId: params.workspaceId,
      type:        'CAMPAIGN_COMPLETED',
      title:       `${result.saved} prospects sourcés`,
      body:        `Prospection IA terminée : ${result.saved} leads enrichis et scorés${fastTrack > 0 ? `, dont ${fastTrack} Fast Track` : ''}${sent > 0 ? ` · ${sent} message${sent > 1 ? 's' : ''} en cours d'envoi` : ''}${setAside > 0 ? ` · ${setAside} mis de côté (score trop bas${unscored > 0 ? ` ou non scorés : ${unscored}, à relancer depuis Leads` : ''})` : ''}.`,
      campaignId:  params.campaignId,
      data:        { saved: result.saved, fastTrack, sent, distribution: result.distribution },
    })
  } else {
    await createNotification({
      workspaceId: params.workspaceId,
      type:        'CAMPAIGN_COMPLETED',
      title:       'Prospection terminée : 0 lead',
      body:        result.error
        ?? `Aucun email trouvé sur ${result.candidates} prospects. Vérifiez vos crédits Apollo / fournisseurs d'enrichissement.`,
      campaignId:  params.campaignId,
      data:        { saved: 0, candidates: result.candidates },
    })
  }
}

// ── Wired durable function ───────────────────────────────────────────────────

export const leadPipeline = inngest.createFunction(
  {
    id:          'lead-pipeline',
    name:        'Lead prospecting pipeline',
    concurrency: { limit: 3 },  // bound concurrent heavy runs (API quotas)
    retries:     2,             // collection is idempotent (dedup + upsert)
    triggers:    [{ event: LEAD_PIPELINE_EVENT }],
  },
  async ({ event, step }) =>
    leadPipelineHandler({
      event: event as unknown as { data: LeadPipelineParams },
      step:  step as unknown as StepLike,
    }),
)
