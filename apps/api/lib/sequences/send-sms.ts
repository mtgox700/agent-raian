/**
 * Automatic SMS step: sent through the workspace's own Brevo account, like an
 * email goes through its mailbox. Returns null when the workspace has not
 * switched automatic SMS on; the step then goes to the "À envoyer" queue.
 *
 * At most once: the row is SENDING while Brevo is called, and any outcome
 * where Brevo may have taken the message (no answer, 5xx, a failed write
 * after its yes) leaves it SENDING. The stale-row rule then gives up on the
 * step instead of sending the SMS a second time.
 */

import type { PrismaClient } from '@prisma/client'
import { normalizePhone } from '@/lib/phone/phone'
import { automaticSmsContent, sendBrevoSms } from '@/lib/sms/brevo'
import { optOutPhone } from '@/lib/sms/brevo-events'
import { activeSmsSettings, smsWebhookUrl } from '@/lib/sms/settings'
import type { StepSendResult } from './types'

interface AutoSmsInput {
  sendId:      string
  workspaceId: string
  campaignId:  string
  leadId:      string
  phone:       string
  message:     string
  smsSettings: unknown
}

export async function sendAutomaticSms(
  db: PrismaClient,
  input: AutoSmsInput,
  onSent: () => Promise<void>,
  fetchImpl: typeof fetch = fetch,
): Promise<StepSendResult | null> {
  const settings = activeSmsSettings(input.smsSettings)
  if (!settings) return null

  const digits = normalizePhone(`+${input.phone.replace(/^\+/, '')}`)
  if (!digits) {
    await db.emailSend.update({ where: { id: input.sendId }, data: { status: 'SKIPPED', errorMessage: 'Numéro de téléphone invalide' } })
    return { status: 'skipped', reason: 'NO_PHONE' }
  }

  await db.emailSend.update({ where: { id: input.sendId }, data: { status: 'SENDING' } })

  const result = await sendBrevoSms({
    apiKey:          settings.apiKey,
    sender:          settings.sender,
    recipientDigits: digits,
    content:         automaticSmsContent(input.message),
    webUrl:          smsWebhookUrl(input.workspaceId),
    tag:             `phantera-${input.campaignId}`,
  }, fetchImpl)

  if (result.ok) {
    try {
      await db.emailSend.update({
        where: { id: input.sendId },
        data:  { status: 'SENT', providerMessageId: `brevo-sms:${result.messageId}`, sentAt: new Date() },
      })
    } catch (err) {
      // Brevo said yes: the row stays SENDING so the SMS is never resent.
      console.error(`[send-step] SMS sent but not recorded leadId=${input.leadId}:`, err instanceof Error ? err.message : err)
      return { status: 'error', error: 'SMS envoyé, enregistrement à reprendre' }
    }
    await onSent()
    return { status: 'sent', sendId: input.sendId, resendMessageId: result.messageId }
  }

  console.warn(`[send-step] SMS not sent leadId=${input.leadId}: ${result.error} ${result.detail}`)

  switch (result.error) {
    case 'UNKNOWN':
      return { status: 'error', error: 'Brevo n’a pas répondu clairement : SMS non renvoyé pour éviter un doublon' }

    case 'RECIPIENT_OPTED_OUT':
      // This number said STOP to the account: never again, on any channel.
      await db.emailSend.update({ where: { id: input.sendId }, data: { status: 'SKIPPED', errorMessage: 'Numéro désinscrit (STOP)' } })
      await optOutPhone(db, input.workspaceId, digits)
      return { status: 'skipped', reason: 'DNC' }

    case 'AUTH':
    case 'NO_CREDITS':
    case 'ACCOUNT': {
      // The account cannot send: the user sends this one from their phone.
      const why = { AUTH: 'Clé Brevo refusée', NO_CREDITS: 'Plus de crédits SMS Brevo', ACCOUNT: 'Compte ou expéditeur Brevo bloqué' }[result.error]
      await db.$transaction([
        db.emailSend.update({ where: { id: input.sendId }, data: { status: 'AWAITING_USER', errorMessage: why } }),
        db.leadTouch.create({
          data: {
            workspaceId: input.workspaceId,
            leadId:      input.leadId,
            campaignId:  input.campaignId,
            channel:     'SMS',
            body:        input.message,
            status:      'TODO',
            emailSendId: input.sendId,
          },
        }),
      ])
      return { status: 'skipped', reason: 'AWAITING_USER' }
    }

    default:
      // INVALID or RATE_LIMITED: Brevo refused, nothing left; retried within the attempt budget.
      await db.emailSend.update({
        where: { id: input.sendId },
        data:  { status: 'FAILED', errorMessage: `Brevo : ${result.detail}`.slice(0, 500), attempts: { increment: 1 } },
      })
      return { status: 'error', error: `Brevo : ${result.error}` }
  }
}
