/**
 * Data of the History page (/dashboard/history), served by GET /api/views/history.
 *
 * Two independent reads batched in ONE parallel round-trip (no N+1, see
 * TEAM_MEMORY 2026-06-25): workspace notifications (replies, quota,
 * campaign completions, SDR approvals) + campaign lifecycle events, merged
 * into a single chronological stream; the client groups and filters.
 */

import type { PrismaClient } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access'
import { campaignScope, notificationScope } from '@/lib/auth/scope'

export interface HistoryEvent {
  id: string
  kind: 'campaign' | 'reply' | 'system'
  title: string
  body: string | null
  href?: string
  createdAt: string
}

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT:     'brouillon',
  ACTIVE:    'active',
  PAUSED:    'en pause',
  COMPLETED: 'terminée',
  ARCHIVED:  'archivée',
}

function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABELS[status] ?? status.toLowerCase()
}

export async function historyView(db: PrismaClient, workspace: AccessContext): Promise<{ events: HistoryEvent[] }> {
  const visibleNotifications = await notificationScope(db, workspace)
  const [notifications, campaigns] = await Promise.all([
    db.notification.findMany({
      where:   visibleNotifications,
      select:  { id: true, type: true, title: true, body: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take:    150,
    }),
    db.campaign.findMany({
      where:   campaignScope(workspace),
      select:  { id: true, name: true, status: true, createdAt: true, sentCount: true },
      orderBy: { createdAt: 'desc' },
      take:    50,
    }),
  ])

  const notifEvents: HistoryEvent[] = notifications.map((n) => ({
    id:        `n-${n.id}`,
    kind:      n.type.startsWith('LEAD_REPLIED') || n.type === 'LEAD_CLICKED_WHATSAPP'
      ? 'reply'
      : n.type.startsWith('CAMPAIGN')
        ? 'campaign'
        : 'system',
    title:     n.title,
    body:      n.body,
    createdAt: n.createdAt.toISOString(),
  }))

  const campaignEvents: HistoryEvent[] = campaigns.map((c) => ({
    id:        `c-${c.id}`,
    kind:      'campaign',
    title:     `Campagne créée : ${c.name}`,
    body:      c.sentCount > 0
      ? `${c.sentCount} e-mail${c.sentCount > 1 ? 's' : ''} envoyé${c.sentCount > 1 ? 's' : ''} à ce jour · ${campaignStatusLabel(c.status)}`
      : `Statut actuel : ${campaignStatusLabel(c.status)}`,
    href:      `/dashboard/campaigns/${c.id}`,
    createdAt: c.createdAt.toISOString(),
  }))

  const events = [...notifEvents, ...campaignEvents].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  )
  return { events }
}
