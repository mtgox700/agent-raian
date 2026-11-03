/**
 * Phantera: Inngest client (durable execution)
 *
 * Inngest runs our async work as durable functions: each step is checkpointed,
 * retried independently, and survives deploys/timeouts. This replaces the
 * synchronous Vercel cron for sequence processing.
 *
 * Dev: run `npx inngest-cli@latest dev` (no keys needed) alongside `npm run dev`.
 * Prod: connect the Inngest Vercel integration (or set INNGEST_EVENT_KEY +
 * INNGEST_SIGNING_KEY) so the schedule fires and the /api/inngest endpoint syncs.
 */

import { Inngest } from 'inngest'

/** Event name for the per-campaign fan-out (data: { campaignId: string }). */
export const CAMPAIGN_PROCESS_EVENT = 'phantera/campaign.process'

/**
 * Run the lead prospecting pipeline durably, off the request timeline
 * (data: LeadPipelineParams). Triggered when a campaign is launched with AI
 * prospecting: replaces the 60/300s-bound SSE pipeline for background runs.
 */
export const LEAD_PIPELINE_EVENT = 'phantera/lead.pipeline'

/** A buying signal arrived: the SDR plans an action (data: SdrSignalEventData). */
export const SIGNAL_RECEIVED_EVENT = 'phantera/signal.received'

/** The SDR has decided an action for a lead (data: { leadId, plan }). */
export const SDR_ACTION_PLANNED_EVENT = 'phantera/sdr.action_planned'

/** Sends were queued: drain the sending queue now (data: { reason: string }). */
export const EMAIL_DRIP_KICK_EVENT = 'phantera/email.drip.kick'
export const WORKSPACE_EXPORT_EVENT = 'phantera/workspace.export'

export const inngest = new Inngest({ id: 'phantera' })
