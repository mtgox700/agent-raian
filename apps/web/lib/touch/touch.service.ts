/**
 * WhatsApp / SMS messages the user sends from their own phone.
 *
 * Phantera drafts, the user sends: the phone app opens with the message
 * prefilled. Each send is recorded, counted against a human daily volume,
 * and refused for a lead marked "ne plus contacter".
 */

import { db } from '@/lib/db'
import { leadScope, touchScope, type Scope } from '@/lib/auth/scope'
import { parseSignature } from '@/lib/email/signature'
import { renderEmailTemplate } from '@/lib/services/resend-client'
import { smsLink, whatsappLink } from '@/lib/phone/phone'
import { draftTouchMessage, TOUCH_MAX_LENGTH, type TouchChannel } from '@/lib/touch/draft'

/** Per workspace and per day, all channels: beyond, it no longer looks human. */
export const DAILY_TOUCH_LIMIT = 40

export type TouchError = 'NOT_FOUND' | 'NO_PHONE' | 'DO_NOT_CONTACT' | 'DAILY_LIMIT' | 'TOO_LONG' | 'EMPTY'

export const TOUCH_ERROR_MESSAGES: Record<TouchError, string> = {
  NOT_FOUND:      'Lead introuvable.',
  NO_PHONE:       "Ajoutez d'abord le numéro du lead (format international, ex. +33 6 12 34 56 78).",
  DO_NOT_CONTACT: 'Ce lead ne doit plus être contacté.',
  DAILY_LIMIT:    `Limite de ${DAILY_TOUCH_LIMIT} messages WhatsApp/SMS par jour atteinte : au-delà, vos envois ressemblent à de la diffusion. Reprenez demain.`,
  TOO_LONG:       'Message trop long pour ce canal.',
  EMPTY:          'Le message est vide.',
}

const TOUCH_ERROR_STATUS: Record<TouchError, number> = {
  NOT_FOUND: 404, NO_PHONE: 422, DO_NOT_CONTACT: 409, DAILY_LIMIT: 429, TOO_LONG: 422, EMPTY: 422,
}

export function touchErrorStatus(error: TouchError): number {
  return TOUCH_ERROR_STATUS[error]
}

/** Touches recorded over the last 24 hours, all channels. */
async function countTouchesToday(workspaceId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return db.leadTouch.count({ where: { workspaceId, status: 'SENT', sentAt: { gte: since } } })
}

/** A lead the caller sees (lib/auth/scope), never another member's. */
async function loadLead(scope: Scope, leadId: string) {
  return db.lead.findFirst({
    where:  { AND: [{ id: leadId }, leadScope(scope)] },
    select: {
      id: true, firstName: true, lastName: true, company: true, title: true, industry: true,
      phone: true, doNotContact: true, status: true, campaignId: true,
      campaign: { select: { valueProposition: true } },
      emailSends: {
        where:   { sentAt: { not: null } },
        orderBy: { sentAt: 'desc' },
        take:    1,
        select:  { emailStep: { select: { subject: true } } },
      },
    },
  })
}

export async function draftTouch(
  scope: Scope,
  leadId: string,
  channel: TouchChannel,
): Promise<{ ok: true; body: string; remainingToday: number } | { ok: false; error: TouchError }> {
  const { workspaceId } = scope
  const lead = await loadLead(scope, leadId)
  if (!lead) return { ok: false, error: 'NOT_FOUND' }
  if (lead.doNotContact) return { ok: false, error: 'DO_NOT_CONTACT' }
  if (!lead.phone) return { ok: false, error: 'NO_PHONE' }
  // Checked here, before the user opens the phone app: the send itself
  // happens on the phone, out of Phantera's hands.
  const remainingToday = DAILY_TOUCH_LIMIT - (await countTouchesToday(workspaceId))
  if (remainingToday <= 0) return { ok: false, error: 'DAILY_LIMIT' }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, emailSignature: true } })
  const signature = parseSignature(workspace?.emailSignature)
  const subjectTemplate = lead.emailSends[0]?.emailStep?.subject ?? null

  const body = await draftTouchMessage({
    channel,
    lead:   { firstName: lead.firstName, company: lead.company, title: lead.title },
    sender: { fullName: signature?.fullName || '', company: signature?.company || workspace?.name || '' },
    offer:  lead.campaign?.valueProposition ?? null,
    previousSubject: subjectTemplate
      ? renderEmailTemplate(subjectTemplate, {
          firstName: lead.firstName, lastName: lead.lastName,
          company: lead.company ?? '', title: lead.title ?? '', industry: lead.industry ?? '',
        })
      : null,
  })
  return { ok: true, body, remainingToday }
}

export async function recordTouch(
  scope: Scope,
  leadId: string,
  channel: TouchChannel,
  rawBody: string,
): Promise<{ ok: true; link: string; remainingToday: number } | { ok: false; error: TouchError }> {
  const body = rawBody.trim()
  if (!body) return { ok: false, error: 'EMPTY' }
  if (body.length > TOUCH_MAX_LENGTH[channel]) return { ok: false, error: 'TOO_LONG' }

  const { workspaceId } = scope
  const lead = await loadLead(scope, leadId)
  if (!lead) return { ok: false, error: 'NOT_FOUND' }
  if (lead.doNotContact) return { ok: false, error: 'DO_NOT_CONTACT' }
  if (!lead.phone) return { ok: false, error: 'NO_PHONE' }

  const sentToday = await countTouchesToday(workspaceId)
  if (sentToday >= DAILY_TOUCH_LIMIT) return { ok: false, error: 'DAILY_LIMIT' }

  await db.$transaction([
    db.leadTouch.create({ data: { workspaceId, leadId, campaignId: lead.campaignId, channel, body, status: 'SENT', sentAt: new Date() } }),
    ...(lead.status === 'new' || lead.status === 'queued'
      ? [db.lead.update({ where: { id: leadId }, data: { status: 'contacted' } })]
      : []),
  ])

  return {
    ok: true,
    link: channel === 'WHATSAPP' ? whatsappLink(lead.phone, body) : smsLink(lead.phone, body),
    remainingToday: DAILY_TOUCH_LIMIT - sentToday - 1,
  }
}

export async function listTouches(scope: Scope, leadId: string) {
  return db.leadTouch.findMany({
    where:   { ...touchScope(scope), leadId, status: 'SENT' },
    orderBy: { createdAt: 'desc' },
    take:    10,
    select:  { id: true, channel: true, body: true, createdAt: true },
  })
}

// ─── "À envoyer" queue (WhatsApp / SMS sequence steps) ────────────────────────

export type QueueError = 'NOT_FOUND' | 'ALREADY_DONE' | 'DO_NOT_CONTACT' | 'DAILY_LIMIT' | 'TOO_LONG' | 'EMPTY'

export const QUEUE_ERROR_MESSAGES: Record<QueueError, string> = {
  NOT_FOUND:      'Message introuvable.',
  ALREADY_DONE:   'Ce message a déjà été traité.',
  DO_NOT_CONTACT: 'Ce lead ne doit plus être contacté : le message est retiré de la file.',
  DAILY_LIMIT:    TOUCH_ERROR_MESSAGES.DAILY_LIMIT,
  TOO_LONG:       TOUCH_ERROR_MESSAGES.TOO_LONG,
  EMPTY:          TOUCH_ERROR_MESSAGES.EMPTY,
}

const QUEUE_ERROR_STATUS: Record<QueueError, number> = {
  NOT_FOUND: 404, ALREADY_DONE: 409, DO_NOT_CONTACT: 409, DAILY_LIMIT: 429, TOO_LONG: 422, EMPTY: 422,
}

export function queueErrorStatus(error: QueueError): number {
  return QUEUE_ERROR_STATUS[error]
}

/**
 * Messages drafted by sequence steps, oldest first. A lead that replied or
 * opted out meanwhile is dropped from the queue (its step is passed over).
 */
export async function listQueue(scope: Scope) {
  const rows = await db.leadTouch.findMany({
    where:   { ...touchScope(scope), status: 'TODO' },
    orderBy: { createdAt: 'asc' },
    take:    100,
    select:  {
      id: true, channel: true, body: true, createdAt: true, emailSendId: true,
      lead: { select: { id: true, firstName: true, lastName: true, company: true, title: true, phone: true, doNotContact: true, status: true } },
    },
  })
  const closed = rows.filter((r) => r.lead.doNotContact || r.lead.status === 'lost' || r.lead.status === 'converted')
  if (closed.length > 0) {
    await Promise.all(closed.map((r) => passOver(r.id, r.emailSendId, 'Lead a répondu ou ne doit plus être contacté')))
  }
  const open = rows.filter((r) => !closed.includes(r))
  return {
    items: open.map((r) => ({ id: r.id, channel: r.channel, body: r.body, createdAt: r.createdAt, lead: r.lead })),
    remainingToday: Math.max(0, DAILY_TOUCH_LIMIT - (await countTouchesToday(scope.workspaceId))),
  }
}

export async function countQueue(scope: Scope): Promise<number> {
  return db.leadTouch.count({ where: { AND: [touchScope(scope), { status: 'TODO', lead: { doNotContact: false } }] } })
}

async function passOver(touchId: string, emailSendId: string | null, reason: string): Promise<void> {
  await db.$transaction([
    db.leadTouch.update({ where: { id: touchId }, data: { status: 'SKIPPED' } }),
    ...(emailSendId
      ? [db.emailSend.update({ where: { id: emailSendId }, data: { status: 'SKIPPED', errorMessage: reason } })]
      : []),
  ])
}

async function loadQueued(scope: Scope, touchId: string) {
  return db.leadTouch.findFirst({
    where:  { id: touchId, ...touchScope(scope) },
    select: {
      id: true, status: true, channel: true, emailSendId: true, campaignId: true, leadId: true,
      lead: { select: { doNotContact: true, status: true } },
    },
  })
}

/**
 * The user opened the message on their phone: the step counts as sent (the
 * sequence goes on from it) and the lead as contacted.
 */
export async function markQueuedSent(
  scope: Scope,
  touchId: string,
  editedBody: string,
): Promise<{ ok: true; remainingToday: number } | { ok: false; error: QueueError }> {
  const touch = await loadQueued(scope, touchId)
  if (!touch) return { ok: false, error: 'NOT_FOUND' }
  if (touch.status !== 'TODO') return { ok: false, error: 'ALREADY_DONE' }
  if (touch.lead.doNotContact) {
    await passOver(touch.id, touch.emailSendId, 'Lead ne doit plus être contacté')
    return { ok: false, error: 'DO_NOT_CONTACT' }
  }
  const body = editedBody.trim()
  if (!body) return { ok: false, error: 'EMPTY' }
  if (body.length > TOUCH_MAX_LENGTH[touch.channel as TouchChannel]) return { ok: false, error: 'TOO_LONG' }

  const sentToday = await countTouchesToday(scope.workspaceId)
  if (sentToday >= DAILY_TOUCH_LIMIT) return { ok: false, error: 'DAILY_LIMIT' }

  const now = new Date()
  // status: 'TODO' in the where: two taps on two devices count once.
  const claimed = await db.leadTouch.updateMany({
    where: { id: touch.id, status: 'TODO' },
    data:  { status: 'SENT', sentAt: now, body },
  })
  if (claimed.count === 0) return { ok: false, error: 'ALREADY_DONE' }

  await db.$transaction([
    ...(touch.emailSendId
      ? [db.emailSend.update({ where: { id: touch.emailSendId }, data: { status: 'SENT', sentAt: now } })]
      : []),
    ...(touch.campaignId
      ? [db.campaign.update({ where: { id: touch.campaignId }, data: { sentCount: { increment: 1 } } })]
      : []),
    ...(touch.lead.status === 'new' || touch.lead.status === 'queued'
      ? [db.lead.update({ where: { id: touch.leadId }, data: { status: 'contacted' } })]
      : []),
  ])
  return { ok: true, remainingToday: DAILY_TOUCH_LIMIT - sentToday - 1 }
}

/** The user passes over this message: the sequence goes on to the next step. */
export async function skipQueued(
  scope: Scope,
  touchId: string,
): Promise<{ ok: true } | { ok: false; error: QueueError }> {
  const touch = await loadQueued(scope, touchId)
  if (!touch) return { ok: false, error: 'NOT_FOUND' }
  if (touch.status !== 'TODO') return { ok: false, error: 'ALREADY_DONE' }
  await passOver(touch.id, touch.emailSendId, 'Étape passée par l’utilisateur')
  return { ok: true }
}
