/**
 * Phantera: Notifications Service
 *
 * Pure functions for creating, listing, and marking notifications.
 * All writes are immutable: returns the created/updated object.
 * Never mutates state in-place.
 */

import { db } from '@/lib/db'
import { Prisma, type NotificationType } from '@prisma/client'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface NotificationPayload {
  workspaceId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
  leadId?: string
  campaignId?: string
  /** For one member only (their mailbox, their channel). */
  userId?: string
}

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  data: Record<string, unknown>
  leadId: string | null
  campaignId: string | null
  readAt: string | null
  createdAt: string
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createNotification(
  payload: NotificationPayload,
): Promise<NotificationItem> {
  const n = await db.notification.create({
    data: {
      workspaceId: payload.workspaceId,
      type:        payload.type,
      title:       payload.title,
      body:        payload.body,
      data:        (payload.data ?? {}) as Prisma.InputJsonObject,
      leadId:      payload.leadId,
      campaignId:  payload.campaignId,
      userId:      payload.userId,
    },
  })

  return {
    id:          n.id,
    type:        n.type,
    title:       n.title,
    body:        n.body,
    data:        n.data as Record<string, unknown>,
    leadId:      n.leadId,
    campaignId:  n.campaignId,
    readAt:      n.readAt?.toISOString() ?? null,
    createdAt:   n.createdAt.toISOString(),
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────
// Every read and write below takes the caller's scope (lib/auth/scope
// notificationScope): a member never lists nor marks another member's.

export async function listNotifications(
  scope: Prisma.NotificationWhereInput,
  { unreadOnly = false, limit = 20 } = {},
): Promise<NotificationItem[]> {
  const rows = await db.notification.findMany({
    where: {
      AND: [scope, unreadOnly ? { readAt: null } : {}],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return rows.map((n) => ({
    id:          n.id,
    type:        n.type,
    title:       n.title,
    body:        n.body,
    data:        n.data as Record<string, unknown>,
    leadId:      n.leadId,
    campaignId:  n.campaignId,
    readAt:      n.readAt?.toISOString() ?? null,
    createdAt:   n.createdAt.toISOString(),
  }))
}

// ─── Mark read ────────────────────────────────────────────────────────────────

export async function markNotificationRead(
  notificationId: string,
  scope: Prisma.NotificationWhereInput,
): Promise<void> {
  await db.notification.updateMany({
    where: { AND: [scope, { id: notificationId }] },
    data:  { readAt: new Date() },
  })
}

export async function markAllNotificationsRead(scope: Prisma.NotificationWhereInput): Promise<void> {
  await db.notification.updateMany({
    where: { AND: [scope, { readAt: null }] },
    data:  { readAt: new Date() },
  })
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export async function countUnreadNotifications(scope: Prisma.NotificationWhereInput): Promise<number> {
  return db.notification.count({
    where: { AND: [scope, { readAt: null }] },
  })
}

// ─── Build notification from reply classification ─────────────────────────────

export function buildReplyNotification(params: {
  workspaceId: string
  leadName: string
  company: string | null
  classification: string
  leadId: string
  campaignId: string
  campaignName: string
}): NotificationPayload {
  const { workspaceId, leadName, company, classification, leadId, campaignId, campaignName } = params
  const companyStr = company ? ` @ ${company}` : ''

  if (classification === 'MEETING_REQUEST') {
    return {
      workspaceId,
      type:       'LEAD_REPLIED_MEETING',
      title:      'Demande de rendez-vous !',
      body:       `${leadName}${companyStr} veut planifier un appel : ${campaignName}`,
      leadId,
      campaignId,
      data: { leadName, company, classification, campaignName },
    }
  }

  if (classification === 'NEUTRAL') {
    return {
      workspaceId,
      type:       'LEAD_REPLIED_NEUTRAL',
      title:      'Nouvelle réponse',
      body:       `${leadName}${companyStr} a répondu : ${campaignName}`,
      leadId,
      campaignId,
      data: { leadName, company, classification, campaignName },
    }
  }

  if (classification === 'POSITIVE') {
    return {
      workspaceId,
      type:       'LEAD_REPLIED_POSITIVE',
      title:      'Réponse positive !',
      body:       `${leadName}${companyStr} est intéressé : ${campaignName}`,
      leadId,
      campaignId,
      data: { leadName, company, classification, campaignName },
    }
  }

  return {
    workspaceId,
    type:       'LEAD_REPLIED_NEGATIVE',
    title:      'Réponse négative',
    body:       `${leadName}${companyStr} n'est pas intéressé`,
    leadId,
    campaignId,
    data: { leadName, company, classification, campaignName },
  }
}
