/**
 * Phantera: Sequence Domain Types
 *
 * Shared types for the multi-step email sequence engine.
 * Pure data: no I/O.
 */

// ─── Successful send statuses ─────────────────────────────────────────────────

export const SENT_STATUSES = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] as const

/**
 * A step counts as done for the sequence's progression once sent, or once
 * passed over (a WhatsApp/SMS step for a lead without a number, or skipped by
 * the user). SKIPPED never counts as sent in the statistics.
 */
export const STEP_DONE_STATUSES = [...SENT_STATUSES, 'SKIPPED'] as const

/** Phone steps: drafted by Phantera, sent by the user from their own phone. */
export const PHONE_CHANNELS = ['WHATSAPP', 'SMS'] as const

/** A step that failed this many times for a lead is not retried any more. */
export const MAX_SEND_ATTEMPTS = 3

/**
 * A SENDING row older than this means the worker died between the provider
 * call and the database write: the outcome is unknown, so the step is never
 * retried (a prospect must not receive the same message twice).
 */
export const SENDING_STALE_MS = 10 * 60 * 1000
export type SentStatus = (typeof SENT_STATUSES)[number]

// ─── Candidate ────────────────────────────────────────────────────────────────

/** A lead that is due to receive a specific next step. */
export interface SequenceCandidate {
  leadId:           string
  campaignId:       string
  workspaceId:      string
  nextStepId:       string
  nextStepPosition: number
  /** When this step became due (step1.sentAt + nextStep.dayOffset days) */
  dueAt:            Date
}

// ─── Skip reasons ─────────────────────────────────────────────────────────────

export type SkipReason =
  | 'DNC'                // Lead replied: doNotContact = true
  | 'STATUS_LOST'        // Lead status is 'lost' or 'converted'
  | 'ALREADY_SENT'       // Successful EmailSend already exists for this step
  | 'CAMPAIGN_INACTIVE'  // Campaign is not ACTIVE
  | 'NO_STEP'            // No next step exists in the sequence
  | 'CONTENT_FLAGGED'    // Rendered content tripped the spam linter (deliverability guard)
  | 'UNDELIVERABLE'      // Email failed verification (invalid/unknown): protects sender reputation
  | 'CHANNEL_CAP'        // LinkedIn daily send cap reached: retried the next day
  | 'PACED'           // Too soon after the workspace's previous email: queued for the email-drip cron
  | 'SUPPRESSED'         // Address opted out / bounced / complained elsewhere in the workspace
  | 'MAILBOX_CAP'        // Sending mailbox at its daily cap or warm-up ramp: queued for the email-drip cron
  | 'MAILBOX_DISCONNECTED' // The campaign's mailbox (or its owner's) is disconnected: queued until reconnected
  | 'NO_SENDER'          // Its owner has no mailbox in a team that sends from its own: queued until one is connected or shared
  | 'LINKEDIN_CAP'       // LinkedIn daily cap reached: queued for the drip, sent the next day
  | 'IN_FLIGHT'          // Another worker is sending this step right now
  | 'GAVE_UP'            // This step failed MAX_SEND_ATTEMPTS times for this lead: no more retries
  | 'LEAD_MOVED'         // The lead now belongs to another campaign: its old queued messages are closed
  | 'AWAITING_USER'      // WhatsApp/SMS step drafted into the "À envoyer" queue : the user sends it
  | 'NO_PHONE'           // WhatsApp/SMS step for a lead without a number: passed over, the sequence goes on

// ─── Per-lead send result ─────────────────────────────────────────────────────

export type StepSendResult =
  | { status: 'sent';    sendId: string; resendMessageId: string }
  | { status: 'skipped'; reason: SkipReason }
  | { status: 'error';   error: string }

// ─── Campaign batch result ────────────────────────────────────────────────────

export interface CampaignProcessResult {
  campaignId: string
  sent:        number
  /** Due steps handed to the sending queue in this run. */
  queued:      number
  skipped:     number
  errors:      number
  completed:   boolean  // campaign moved to COMPLETED
}
