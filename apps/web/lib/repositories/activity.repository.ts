/**
 * Phantera: Activity Repository
 *
 * Builds a unified, time-ordered activity feed from EmailSend + EmailReply
 * tables for a given workspace. No mock data: pure DB reads.
 */

import { db } from '@/lib/db'
import { replyScope, sendScope, type Scope } from '@/lib/auth/scope'
import type { ActivityEvent, ActivityType } from '@/lib/types/dashboard'

const ACTIVITY_LIMIT = 30

// ─── Internal raw types ───────────────────────────────────────────────────────

interface RawSendEvent {
  id: string
  status: string
  sentAt: Date | null
  openedAt: Date | null
  lead: { firstName: string; lastName: string; company: string | null }
  campaign: { name: string }
}

interface RawReplyEvent {
  id: string
  receivedAt: Date
  classification: string
  fromEmail: string
  lead: { firstName: string; lastName: string; company: string | null }
  campaign: { name: string }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapSend(s: RawSendEvent): ActivityEvent | null {
  const leadName = `${s.lead.firstName} ${s.lead.lastName}`
  const company = s.lead.company ? ` @ ${s.lead.company}` : ''

  if (s.openedAt) {
    return {
      id: `open-${s.id}`,
      type: 'email_sent' as ActivityType,
      title: 'Email ouvert',
      description: `${leadName}${company} a ouvert votre email`,
      timestamp: s.openedAt.toISOString(),
    }
  }

  if (s.sentAt && s.status === 'SENT') {
    return {
      id: `sent-${s.id}`,
      type: 'email_sent' as ActivityType,
      title: 'Email envoyé',
      description: `Email envoyé à ${leadName}${company} : ${s.campaign.name}`,
      timestamp: s.sentAt.toISOString(),
    }
  }

  return null
}

function mapReply(r: RawReplyEvent): ActivityEvent {
  const leadName = `${r.lead.firstName} ${r.lead.lastName}`
  const company = r.lead.company ? ` @ ${r.lead.company}` : ''
  const isPositive = r.classification === 'POSITIVE'
  const isMeeting = r.classification === 'MEETING_REQUEST'

  const type: ActivityType =
    isPositive || isMeeting ? 'lead_qualified' : 'reply_received'

  const title =
    isMeeting ? 'Demande de rendez-vous !' :
    isPositive ? 'Réponse positive !' :
    r.classification === 'NEGATIVE' ? 'Réponse négative' : 'Réponse reçue'

  return {
    id: `reply-${r.id}`,
    type,
    title,
    description: `${leadName}${company} a répondu : ${r.campaign.name}`,
    timestamp: r.receivedAt.toISOString(),
    metadata: { leadName },
  }
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getWorkspaceActivity(
  scope: Scope,
  limit = ACTIVITY_LIMIT,
): Promise<ActivityEvent[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [sends, replies] = await Promise.all([
    db.emailSend.findMany({
      where: {
        ...sendScope(scope),
        OR: [
          { sentAt: { gte: since } },
          { openedAt: { gte: since } },
        ],
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        sentAt: true,
        openedAt: true,
        lead: { select: { firstName: true, lastName: true, company: true } },
        campaign: { select: { name: true } },
      },
    }),

    db.emailReply.findMany({
      where: {
        ...replyScope(scope),
        receivedAt: { gte: since },
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        receivedAt: true,
        classification: true,
        fromEmail: true,
        lead: { select: { firstName: true, lastName: true, company: true } },
        campaign: { select: { name: true } },
      },
    }),
  ])

  const events: ActivityEvent[] = []

  for (const s of sends) {
    const ev = mapSend(s as RawSendEvent)
    if (ev) events.push(ev)
  }

  for (const r of replies) {
    events.push(mapReply(r as RawReplyEvent))
  }

  // Sort by timestamp desc, take top N
  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
}
