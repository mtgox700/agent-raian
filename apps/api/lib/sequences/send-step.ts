/**
 * sendStepToLead
 *
 * Sends a single campaign email step to a single lead, fully idempotent:
 *  - If a successful EmailSend already exists -> returns 'skipped'
 *  - Cleans up stale PENDING / FAILED records from prior cron attempts
 *  - Creates fresh PENDING record, sends via Resend, updates to SENT
 *  - Increments campaign.sentCount on success
 *  - Updates lead.status to 'contacted' if still 'new'
 *
 * Does NOT throw: all errors are returned as { status: 'error', error }.
 */

import { finalizeDraft as finalizePhoneMessage } from '@/lib/touch/finalize'
import { sendAutomaticSms } from './send-sms'
import type { PrismaClient } from '@prisma/client'
import {
  renderEmailTemplate, renderSubject,
  textToHtml,
} from '@/lib/services/resend-client'
import { routeSend, resolveSendingMailbox } from '@/lib/email/sender-router'
import { sendableBy } from '@/lib/auth/scope'
import { senderHold } from '@/lib/email/sender-hold'
import { renderSignatureHtml, parseSignature } from '@/lib/email/signature'
import {
  linkedInPublicIdentifier,
  resolveLinkedInProviderId,
  sendLinkedInMessage,
  sendLinkedInInvitation,
} from '@/lib/multichannel/unipile'
import { fitInviteNote } from '@/lib/multichannel/linkedin-limits'
import { MAX_SEND_ATTEMPTS, SENDING_STALE_MS, SENT_STATUSES, type StepSendResult } from './types'
import { DEFAULT_DAILY_CAP } from '@/lib/deliverability/send-policy'
import { classifyProviderThrottle, type ThrottleVerdict } from '@/lib/email/provider-throttle'
import { emailGapSeconds, linkedInGapSeconds } from './pacing'
import { checkEmailGate, type EmailGateDb } from './email-gate'
import { flushServerEvents, trackServer } from '@/lib/analytics/server-events'
import { claimMailboxSlot, pauseMailbox } from './mailbox-slot'

interface SendStepParams {
  db:          PrismaClient
  leadId:      string
  campaignId:  string
  stepId:      string
  workspaceId: string
}

export async function sendStepToLead({
  db,
  leadId,
  campaignId,
  stepId,
  workspaceId,
}: SendStepParams): Promise<StepSendResult> {
  let sendId: string | null = null
  let sendingMailboxId: string | null = null
  try {
    // 1. Idempotency: skip if already sent successfully (or, for a phone
    // step, already drafted into the user's queue or passed over)
    const existingSend = await db.emailSend.findFirst({
      where: {
        leadId,
        campaignId,
        emailStepId: stepId,
        status: { in: [...SENT_STATUSES, 'AWAITING_USER', 'SKIPPED'] },
      },
      select: { id: true },
    })
    if (existingSend) {
      return { status: 'skipped', reason: 'ALREADY_SENT' }
    }

    // 2. Load required data in parallel
    const [lead, step, workspace, campaign] = await Promise.all([
      db.lead.findUnique({
        where:  { id: leadId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          company: true, title: true, industry: true,
          doNotContact: true, status: true, linkedinUrl: true, campaignId: true, phone: true,
        },
      }),
      db.campaignEmailStep.findUnique({
        where:  { id: stepId },
        select: { id: true, subject: true, body: true, channel: true, inviteNote: true },
      }),
      db.workspace.findUnique({
        where:  { id: workspaceId },
        select: { sendingDomain: true, emailSignature: true, smsSettings: true, deletionScheduledFor: true },
      }),
      db.campaign.findUnique({
        where:  { id: campaignId },
        select: { status: true, senderLostAt: true, ownerUserId: true },
      }),
    ])

    if (!lead || !step || !workspace) {
      await closeQueuedRow(db, leadId, stepId, 'Lead, step, or workspace not found')
      return { status: 'error', error: 'Lead, step, or workspace not found' }
    }

    // 2.4 A workspace whose deletion is scheduled sends nothing, whatever
    // the state of its campaigns (lib/privacy/workspace-deletion).
    if (workspace.deletionScheduledFor) {
      return { status: 'skipped', reason: 'CAMPAIGN_INACTIVE' }
    }

    // 2.5 A paused or finished campaign sends nothing; its queue waits.
    if (campaign?.status !== 'ACTIVE') {
      return { status: 'skipped', reason: 'CAMPAIGN_INACTIVE' }
    }
    // Its mailbox was removed and no new sender was chosen: wait, never send
    // from another mailbox.
    if (campaign.senderLostAt) {
      return { status: 'skipped', reason: 'MAILBOX_DISCONNECTED' }
    }

    // 3. Re-check DNC: lead may have replied between findDue and now. The
    // queued row is closed: left PENDING it would sit at the head of the
    // campaign's queue forever and hold every lead behind it.
    // 2.6 A lead moved to another campaign must not receive this one's
    // sequence: its queued messages here are closed.
    if (lead.campaignId !== campaignId) {
      await closeQueuedRow(db, leadId, stepId, 'Lead moved to another campaign')
      return { status: 'skipped', reason: 'LEAD_MOVED' }
    }

    if (lead.doNotContact || lead.status === 'lost' || lead.status === 'converted') {
      await closeQueuedRow(db, leadId, stepId, 'Lead replied, opted out or was closed before this step')
      return { status: 'skipped', reason: 'DNC' }
    }

    // 3.5 At most once: a SENDING row means a provider call is in progress,
    // or the worker died mid-send and the outcome is unknown.
    const sending = await db.emailSend.findFirst({
      where:  { leadId, emailStepId: stepId, status: 'SENDING' },
      select: { id: true, createdAt: true },
    })
    if (sending) {
      if (Date.now() - sending.createdAt.getTime() < SENDING_STALE_MS) {
        return { status: 'skipped', reason: 'IN_FLIGHT' }
      }
      await db.emailSend.update({
        where: { id: sending.id },
        data:  {
          status:       'FAILED',
          attempts:     MAX_SEND_ATTEMPTS,
          errorMessage: 'Send interrupted, outcome unknown: not retried to avoid a duplicate',
        },
      })
      return { status: 'skipped', reason: 'GAVE_UP' }
    }

    // 4. Retry budget, then clean up stale PENDING / FAILED records. The
    // failure count is carried over to the new row: a step that keeps failing
    // (revoked mailbox, invalid recipient, LinkedIn refusal) stops after
    // MAX_SEND_ATTEMPTS instead of retrying every hour forever.
    // The count lives on FAILED rows and on PENDING rows created after a
    // failure (a queued retry), so take the max over both.
    const previous = await db.emailSend.aggregate({
      where: { leadId, emailStepId: stepId, status: { in: ['PENDING', 'FAILED'] } },
      _max:  { attempts: true },
    })
    const failedAttempts = previous._max.attempts ?? 0
    if (failedAttempts >= MAX_SEND_ATTEMPTS) {
      await closeQueuedRow(db, leadId, stepId, `Gave up after ${MAX_SEND_ATTEMPTS} failed attempts`)
      return { status: 'skipped', reason: 'GAVE_UP' }
    }

    // 5. Render template: before the queued row is replaced, so a rendering
    // error can never drop the lead from the queue.
    const vars = {
      firstName: lead.firstName,
      lastName:  lead.lastName,
      company:   lead.company  ?? 'votre entreprise',
      title:     lead.title    ?? 'vous',
      industry:  lead.industry ?? 'votre secteur',
    }
    const subject  = renderSubject(step.subject, vars)
    const bodyText = renderEmailTemplate(step.body,    vars)

    await db.emailSend.deleteMany({
      where: {
        leadId,
        emailStepId: stepId,
        status: { in: ['PENDING', 'FAILED'] },
      },
    })

    // 6. Create PENDING record
    const emailSend = await db.emailSend.create({
      data: {
        leadId,
        campaignId,
        emailStepId: stepId,
        status: 'PENDING',
        attempts: failedAttempts,
      },
    })
    sendId = emailSend.id

    // 6.4 WHATSAPP / SMS steps. SMS goes out automatically when the workspace
    // connected its Brevo account (B2B SMS: lawful with the sender named and a
    // STOP, which Brevo adds and enforces). WhatsApp is never automatic: Meta
    // bans accounts that message people who did not write first. Otherwise
    // the message is drafted into the user's "À envoyer" queue; the user
    // sends it from their phone, and the sequence goes on from there.
    if (step.channel === 'WHATSAPP' || step.channel === 'SMS') {
      if (!lead.phone) {
        await db.emailSend.update({
          where: { id: emailSend.id },
          data:  { status: 'SKIPPED', errorMessage: 'Lead sans numéro de téléphone' },
        })
        return { status: 'skipped', reason: 'NO_PHONE' }
      }
      if (step.channel === 'SMS') {
        const automatic = await sendAutomaticSms(db, {
          sendId:      emailSend.id,
          workspaceId,
          campaignId,
          leadId,
          phone:       lead.phone,
          message:     finalizePhoneMessage('SMS', bodyText),
          smsSettings: workspace.smsSettings,
        }, () => recordSentSideEffects(db, campaignId, leadId, lead.status))
        if (automatic) return automatic
      }
      await db.$transaction([
        db.emailSend.update({ where: { id: emailSend.id }, data: { status: 'AWAITING_USER' } }),
        db.leadTouch.create({
          data: {
            workspaceId,
            leadId,
            campaignId,
            channel:     step.channel,
            body:        finalizePhoneMessage(step.channel, bodyText),
            status:      'TODO',
            emailSendId: emailSend.id,
          },
        }),
      ])
      return { status: 'skipped', reason: 'AWAITING_USER' }
    }

    // 6.5 LINKEDIN steps: routed through the workspace's connected Unipile
    // account instead of the email stack. No pixel/unsubscribe (email-only
    // concepts); recipient resolved from the lead's profile URL. Any missing
    // prerequisite (no channel, no URL, unresolvable profile) marks the send
    // FAILED with an explicit reason rather than silently skipping.
    if (step.channel === 'LINKEDIN') {
      const failLinkedIn = async (reason: string): Promise<StepSendResult> => {
        await db.emailSend.update({
          where: { id: emailSend.id },
          data:  { status: 'FAILED', errorMessage: reason.slice(0, 500), attempts: { increment: 1 } },
        }).catch(() => null)
        console.warn(`[send-step] LINKEDIN skip leadId=${leadId} stepId=${stepId}: ${reason}`)
        return { status: 'error', error: reason }
      }

      // Any throw below (Unipile network/config error) must mark the send
      // FAILED: an unhandled throw used to leave a ghost PENDING row with no
      // status update, making diagnosis impossible (2026-07-11: 90 stuck rows).
      try {

      // The campaign owner's LinkedIn, else one shared with the team: never
      // a colleague's account.
      const channel = await db.connectedChannel.findFirst({
        where:   { workspaceId, provider: 'LINKEDIN', status: 'CONNECTED', ...sendableBy(campaign.ownerUserId) },
        orderBy: { sharedWithTeam: 'asc' },
        select:  { unipileAccountId: true },
      })
      if (!channel?.unipileAccountId) {
        return failLinkedIn('Aucun compte LinkedIn connecté (Paramètres, onglet E-mails et canaux)')
      }
      if (!lead.linkedinUrl) {
        return failLinkedIn('Lead sans URL LinkedIn')
      }
      const publicId = linkedInPublicIdentifier(lead.linkedinUrl)
      if (!publicId) {
        return failLinkedIn(`URL LinkedIn invalide: ${lead.linkedinUrl}`)
      }
      const providerId = await resolveLinkedInProviderId(channel.unipileAccountId, publicId)
      if (!providerId) {
        return failLinkedIn(`Profil LinkedIn introuvable: ${publicId}`)
      }

      // Daily cap: LinkedIn restricts accounts that DM too much. Conservative
      // ceiling per connected account per day (env-tunable). Skipped sends stay
      // PENDING-cleaned and are retried by the next cron run (next day).
      const capPerDay = Number(process.env.LINKEDIN_DAILY_CAP ?? 25)
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
      const sentToday = await db.emailSend.count({
        where: {
          // In-flight sends count too, so parallel workers cannot overshoot.
          OR: [
            { status: 'SENT', sentAt: { gte: startOfDay } },
            { status: 'SENDING', createdAt: { gte: new Date(Date.now() - SENDING_STALE_MS) } },
          ],
          emailStep: { channel: 'LINKEDIN' },
          campaign: { workspaceId },
        },
      })
      if (sentToday >= capPerDay) {
        // The PENDING row stays as a queue entry: the email-drip cron sends it
        // once the daily cap frees up. Deleting it lost every first LinkedIn
        // step over the cap (nothing else re-sends step 1).
        console.warn(`[send-step] LINKEDIN daily cap reached (${sentToday}/${capPerDay}) workspaceId=${workspaceId}`)
        return { status: 'skipped', reason: 'LINKEDIN_CAP' }
      }

      // One LinkedIn action at a time, a minute or two apart: LinkedIn flags
      // invitations fired back to back. Too early: stays queued for the drip.
      const liGapSec = linkedInGapSeconds()
      if (liGapSec > 0) {
        const recent = await db.emailSend.findFirst({
          where: {
            id: { not: emailSend.id },
            emailStep: { channel: 'LINKEDIN' },
            campaign: { workspaceId },
            OR: [
              { status: 'SENT', sentAt: { gte: new Date(Date.now() - liGapSec * 1000) } },
              { status: 'SENDING', createdAt: { gte: new Date(Date.now() - SENDING_STALE_MS) } },
            ],
          },
          select: { id: true },
        })
        if (recent) return { status: 'skipped', reason: 'PACED' }
      }

      // Free LinkedIn accounts cannot DM non-connections (403
      // subscription_required). Standard outreach flow (Waalaxy/Expandi):
      // fall back to a CONNECTION INVITATION carrying the message as the
      // note. Once the prospect accepts, follow-up LinkedIn steps deliver
      // as real DMs (1st-degree connections are always messageable).
      await db.emailSend.update({ where: { id: emailSend.id }, data: { status: 'SENDING' } })
      let liResult: Awaited<ReturnType<typeof sendLinkedInMessage>>
      try {
        liResult = await sendLinkedInMessage({
          accountId:           channel.unipileAccountId,
          recipientProviderId: providerId,
          text:                bodyText,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        // LinkedIn signals "not a connection" two ways depending on the
        // profile: 403 subscription_required OR 422 no_connection_with_recipient.
        const notConnected =
          msg.includes('subscription_required')
          || msg.includes('no_connection_with_recipient')
          || msg.includes('(403)')
        if (!notConnected) throw err
        // The lead is NOT a 1st-degree relation, so this goes out as a
        // connection request whose note LinkedIn caps at 300 chars. Use the
        // variant written for that format; older campaigns have no note, so
        // fall back to the DM body fitted on a word boundary rather than
        // shipping a message cut mid-word (founder report, 2026-09-03).
        const noteText = step.inviteNote
          ? renderEmailTemplate(step.inviteNote, vars)
          : fitInviteNote(bodyText)

        await sendLinkedInInvitation({
          accountId:           channel.unipileAccountId,
          recipientProviderId: providerId,
          note:                noteText,
        })
        liResult = { providerMessageId: null, channel: 'linkedin' }
        console.log(`[send-step] LINKEDIN sent as INVITATION (not connected) leadId=${leadId}`)
      }

      const sentAt = new Date()
      await db.emailSend.update({
        where: { id: emailSend.id },
        // providerThreadId -> recipient's LinkedIn provider_id: the inbound
        // webhook matches replies (sender id) against this to find the lead.
        data:  { status: 'SENT', providerMessageId: liResult.providerMessageId, providerThreadId: providerId, sentAt },
      })
      await recordSentSideEffects(db, campaignId, leadId, lead.status)

      return { status: 'sent', sendId: emailSend.id, resendMessageId: liResult.providerMessageId ?? '' }

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return failLinkedIn(`Unipile: ${message}`)
      }
    }

    // 6.8 Sending mailbox. Resend's shared domain is only for workspaces that
    // never connected a mailbox: if they did and it is now disconnected, wait
    // for a reconnect rather than switching the prospect to another sender.
    // Only a mailbox that was actually used counts: the default one, the one
    // assigned to this campaign, or one that already sent.
    const mailbox = await resolveSendingMailbox(workspaceId, campaignId)
    if (!mailbox) {
      // Waits rather than leave from the shared domain when the campaign's
      // mailbox is disconnected, or when its owner has no mailbox in a team
      // that sends from its own (lib/email/sender-hold).
      const waiting = await senderHold(db, { id: campaignId, workspaceId, ownerUserId: campaign.ownerUserId })
      if (waiting) {
        await notifySenderMissing(db, workspaceId, campaign.ownerUserId, waiting.email)
        return { status: 'skipped', reason: waiting.hold }
      }
      const held = await sharedDomainHold(db, workspaceId, emailSend.id)
      if (held) return { status: 'skipped', reason: held }
    }

    // 6.9 Deliverability gate: workspace suppression list, the mailbox's own
    // daily cap (chosen by the customer, optional warm-up ramp), provider
    // pause, content spam linter. A mailbox at its cap keeps the PENDING row
    // as a queue entry for the email-drip cron.
    const gate = await checkEmailGate({
      db: db as unknown as EmailGateDb,
      workspaceId,
      to: lead.email,
      mailbox,
      content: { subject, body: bodyText },
    })
    if (!gate.allowed) {
      if (gate.reason === 'MAILBOX_CAP') return { status: 'skipped', reason: 'MAILBOX_CAP' }
      console.warn(`[send-step] gate ${gate.reason} leadId=${leadId} campaignId=${campaignId}: ${gate.detail}`)
      await db.emailSend.update({
        where: { id: emailSend.id },
        data:  { status: 'FAILED', errorMessage: gate.detail.slice(0, 500), attempts: { increment: 1 } },
      })
      if (gate.reason === 'SUPPRESSED') {
        await db.lead.update({ where: { id: leadId }, data: { doNotContact: true } })
      }
      return { status: 'skipped', reason: gate.reason }
    }

    // 6.95 Pacing: one email at a time per mailbox, spaced by a randomised
    // gap (pacing.ts). Losing the slot is not a failure: the PENDING row stays
    // queued and the drip sends it on a later tick.
    if (mailbox) {
      const gapSec = emailGapSeconds()
      if (gapSec > 0 && !(await claimMailboxSlot(db, mailbox.id, gapSec))) {
        return { status: 'skipped', reason: 'PACED' }
      }
    }
    sendingMailboxId = mailbox?.id ?? null

    // 7. Send via sender-router (Gmail / Outlook / SMTP / Resend fallback)
    await db.emailSend.update({ where: { id: emailSend.id }, data: { status: 'SENDING', mailboxId: sendingMailboxId } })
    const baseUrl       = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://phantera-tn.com'
    const trackingPixel = `${baseUrl}/api/track/open?sid=${emailSend.id}`
    const unsubUrl      = `${baseUrl}/api/webhooks/unsubscribe?sid=${emailSend.id}`
    // Trust Pack: workspace pro signature appended after the body (Gmail-like
    // block: the only branded element allowed in a cold email).
    // The WhatsApp link goes through /api/track/whatsapp so a click on this
    // email is known (buying signal) before the prospect lands on the chat.
    const signatureHtml = renderSignatureHtml(parseSignature(workspace.emailSignature), {
      whatsappHref: `${baseUrl}/api/track/whatsapp?sid=${emailSend.id}`,
    })
    const html          = textToHtml(bodyText, undefined, trackingPixel, unsubUrl, signatureHtml)

    // Reply-To routes the lead's answer to the inbound worker
    // (reply+{sendId}@domain -> Cloudflare Email Worker -> /api/webhooks/inbound-email
    // -> Agent 5 classification). Without it, replies land in the sender's own
    // inbox and Phantera never sees them (bug found 2026-07-13).
    const replyDomain = process.env.INBOUND_REPLY_DOMAIN ?? 'phantera-tn.com'

    const result = await routeSend({
      workspaceId,
      campaignId,
      to:                 lead.email,
      subject,
      html,
      replyTo:            `reply+${emailSend.id}@${replyDomain}`,
      listUnsubscribeUrl: unsubUrl,
      tags: [
        { name: 'campaignId',  value: campaignId  },
        { name: 'workspaceId', value: workspaceId },
        { name: 'sendId',      value: emailSend.id },
      ],
    }, mailbox)

    // 8. The email is out: record SENT first and on its own, so a failing
    // side update can never turn a delivered email into a FAILED one that
    // would be sent again.
    const now = new Date()
    await db.emailSend.update({
      where: { id: emailSend.id },
      data: {
        status:            'SENT',
        resendMessageId:   result.provider === 'resend' ? result.messageId : null,
        providerMessageId: result.providerMessageId,
        providerThreadId:  result.providerThreadId,
        mailboxId:         result.mailboxId,
        sentAt:            now,
      },
    })
    await recordSentSideEffects(db, campaignId, leadId, lead.status)

    return {
      status:          'sent',
      sendId:          emailSend.id,
      resendMessageId: result.messageId,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    // Surface the failure: silent errors here made batch sends look like
    // "25/50 sent" with no clue why the other 25 didn't. Log full context
    // so the operator can diagnose Resend/Gmail/SMTP failures.
    console.error(
      `[send-step] FAILED leadId=${leadId} campaignId=${campaignId} stepId=${stepId}: ${message}`,
    )
    // The provider refused because of volume, not because of this email:
    // pause the mailbox and keep the email queued without using an attempt.
    const throttle = sendingMailboxId ? classifyProviderThrottle(message) : null
    if (throttle && sendId && sendingMailboxId) {
      const held = await holdThrottledSend(db, {
        sendId, mailboxId: sendingMailboxId, workspaceId, verdict: throttle, message,
      }).catch(() => false)
      if (held) return { status: 'skipped', reason: 'MAILBOX_CAP' }
    }
    if (sendId) {
      await db.emailSend.update({
        where: { id: sendId },
        data:  { status: 'FAILED', errorMessage: message.slice(0, 500), attempts: { increment: 1 } },
      }).catch(() => null)
    }
    return { status: 'error', error: message }
  }
}

/** A queued row that will never be sent: mark it given up so the queue moves on. */
async function closeQueuedRow(db: PrismaClient, leadId: string, stepId: string, reason: string): Promise<void> {
  await db.emailSend.updateMany({
    where: { leadId, emailStepId: stepId, status: 'PENDING' },
    data:  { status: 'FAILED', attempts: MAX_SEND_ATTEMPTS, errorMessage: reason.slice(0, 500) },
  }).catch(() => null)
}

/** Campaign counter and lead status after a delivered message; never fatal. */
async function recordSentSideEffects(
  db: PrismaClient,
  campaignId: string,
  leadId: string,
  leadStatus: string,
): Promise<void> {
  try {
    const [campaign] = await Promise.all([
      db.campaign.update({
        where:  { id: campaignId },
        data:   { sentCount: { increment: 1 } },
        select: { sentCount: true, workspaceId: true, workspace: { select: { owner: { select: { clerkId: true } } } } },
      }),
      leadStatus === 'new' || leadStatus === 'queued'
        ? db.lead.update({ where: { id: leadId }, data: { status: 'contacted' } })
        : Promise.resolve(),
    ])
    await trackFirstSend(campaign, campaignId)
  } catch (err: unknown) {
    console.error(`[send-step] post-send update failed campaignId=${campaignId} leadId=${leadId}:`, err instanceof Error ? err.message : String(err))
  }
}

/** Activation milestone: the first message of a campaign has left. */
async function trackFirstSend(
  campaign: { sentCount?: number; workspaceId?: string; workspace?: { owner?: { clerkId?: string | null } | null } | null } | null | undefined,
  campaignId: string,
): Promise<void> {
  const clerkId = campaign?.workspace?.owner?.clerkId
  if (campaign?.sentCount !== 1 || !clerkId || !campaign.workspaceId) return
  trackServer(clerkId, 'first_email_sent', { workspaceId: campaign.workspaceId, campaignId })
  await flushServerEvents()
}

/**
 * Resend shared domain (workspace without a mailbox): Phantera's own domain,
 * so the workspace gets a modest daily cap and the same one-at-a-time rhythm.
 */
async function sharedDomainHold(
  db: PrismaClient,
  workspaceId: string,
  sendId: string,
): Promise<'CHANNEL_CAP' | 'PACED' | null> {
  const now = Date.now()
  const sentLast24h = await db.emailSend.count({
    where: {
      status: { in: [...SENT_STATUSES] },
      sentAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
      mailboxId: null,
      emailStep: { channel: 'EMAIL' },
      campaign: { workspaceId },
    },
  })
  if (sentLast24h >= DEFAULT_DAILY_CAP) return 'CHANNEL_CAP'

  const gapSec = emailGapSeconds()
  if (gapSec === 0) return null
  const busy = await db.emailSend.findFirst({
    where: {
      id: { not: sendId },
      mailboxId: null,
      emailStep: { channel: 'EMAIL' },
      campaign: { workspaceId },
      OR: [
        { status: { in: [...SENT_STATUSES] }, sentAt: { gte: new Date(now - gapSec * 1000) } },
        { status: 'SENDING', createdAt: { gte: new Date(now - SENDING_STALE_MS) } },
      ],
    },
    select: { id: true },
  })
  return busy ? 'PACED' : null
}

/** Pause a throttled mailbox and put the email back in the queue, untouched. */
async function holdThrottledSend(
  db: PrismaClient,
  args: { sendId: string; mailboxId: string; workspaceId: string; verdict: ThrottleVerdict; message: string },
): Promise<boolean> {
  const until = await pauseMailbox(db, args.mailboxId, args.verdict)
  await db.emailSend.update({
    where: { id: args.sendId },
    data:  { status: 'PENDING', errorMessage: args.message.slice(0, 500) },
  })
  console.warn(`[send-step] mailbox ${args.mailboxId} throttled by the provider (${args.verdict.kind}), paused until ${until.toISOString()}`)
  await notifyMailboxPaused(db, args.workspaceId, args.mailboxId, args.verdict, until)
  return true
}

async function notifyMailboxPaused(
  db: PrismaClient,
  workspaceId: string,
  mailboxId: string,
  verdict: ThrottleVerdict,
  until: Date,
): Promise<void> {
  // For the member whose mailbox it is (and the admins, who see everything).
  const mailbox = await db.connectedMailbox.findUnique({ where: { id: mailboxId }, select: { ownerUserId: true } })
  const userId = mailbox?.ownerUserId ?? null
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000)
  const recent = await db.notification.findFirst({
    where:  { workspaceId, userId, type: 'MAILBOX_PAUSED', createdAt: { gte: since } },
    select: { id: true },
  })
  if (recent) return
  const resume = until.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  await db.notification.create({
    data: {
      workspaceId,
      userId,
      type:  'MAILBOX_PAUSED',
      title: 'Envois en pause, reprise automatique',
      body:  verdict.kind === 'daily'
        ? `Votre fournisseur e-mail a atteint sa limite d'envoi du jour. Aucun e-mail n'est perdu : les envois reprennent seuls vers ${resume}. Baissez le plafond quotidien de la boîte si cela se répète.`
        : `Votre fournisseur e-mail demande de ralentir. Aucun e-mail n'est perdu : les envois reprennent seuls vers ${resume}.`,
    },
  }).catch(() => null)
}

/**
 * One notification a day at most, for the member whose campaign waits: their
 * mailbox is disconnected, or they have none (email null).
 */
async function notifySenderMissing(db: PrismaClient, workspaceId: string, userId: string, email: string | null): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recent = await db.notification.findFirst({
    where:  { workspaceId, userId, type: 'MAILBOX_DISCONNECTED', createdAt: { gte: since } },
    select: { id: true },
  })
  if (recent) return
  await db.notification.create({
    data: email
      ? {
          workspaceId,
          userId,
          type:  'MAILBOX_DISCONNECTED',
          title: 'Boîte e-mail déconnectée',
          body:  `${email} n'est plus connectée : vos envois sont en attente. Reconnectez-la dans Paramètres, onglet E-mails et canaux, ou choisissez un autre expéditeur sur la page de la campagne.`,
        }
      : {
          workspaceId,
          userId,
          type:  'MAILBOX_DISCONNECTED',
          title: 'Aucune boîte d’envoi',
          body:  'Vos envois attendent : connectez votre boîte e-mail dans Paramètres, onglet E-mails et canaux, ou demandez à un admin de partager une boîte de l’équipe.',
        },
  }).catch(() => null)
}
