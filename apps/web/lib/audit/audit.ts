/**
 * The audit log: who did what to a workspace's sensitive settings and data.
 *
 * Writing never fails the action it records: the action already happened,
 * and refusing it after the fact would only hide it. A failed write is
 * logged loudly instead. The table itself is append only (migration
 * 20261016090000_audit_events).
 *
 * Privacy: the IP is cut to its network (IPv4 /24, IPv6 /48) and the user
 * agent to "browser · OS". Details hold roles, plans and providers, never a
 * secret or a message body.
 */

import { isIP } from 'node:net'
import type { Prisma, PrismaClient } from '@prisma/client'
import { clientIp } from '@/lib/security/shared-rate-limit'
import type { AuditAction, AuditResult } from './actions'

/** Kept 13 months, then purged daily. */
export const AUDIT_RETENTION_MONTHS = 13

type Db = Pick<PrismaClient, 'auditEvent' | 'user'>

export interface AuditActor {
  /** Internal User.id; null for the system. */
  userId: string | null
  workspaceId: string
}

export interface AuditEntry {
  action: AuditAction
  target?: { type: string; id: string | null }
  result?: AuditResult
  details?: Prisma.InputJsonObject
  /** The request that carried the action, for the network and browser. */
  req?: Request | null
}

export const SYSTEM_ACTOR = 'Système'

/** The network of an address: IPv4 /24, IPv6 /48. Null when unknown. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  if (isIP(ip) === 4) return `${ip.split('.').slice(0, 3).join('.')}.0/24`
  if (isIP(ip) === 6) {
    const [head, tail = ''] = ip.toLowerCase().split('::')
    const left = head ? head.split(':') : []
    const right = tail ? tail.split(':') : []
    const full = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    return `${full.slice(0, 3).map((h) => h.replace(/^0+(?=.)/, '')).join(':')}::/48`
  }
  return null
}

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, 'Windows'], [/iPhone|iPad/, 'iOS'], [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'], [/Linux/, 'Linux'],
]

/** "Chrome · Windows": the family only, never the raw header. */
export function summarizeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? 'Autre navigateur'
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? 'autre système'
  return `${browser} · ${system}`
}

export async function recordAudit(db: Db, actor: AuditActor, entry: AuditEntry): Promise<void> {
  try {
    const user = actor.userId
      ? await db.user.findUnique({ where: { id: actor.userId }, select: { email: true } })
      : null
    const ip = entry.req ? clientIp(entry.req) : null
    await db.auditEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        actorLabel:  user?.email ?? (actor.userId ? 'Membre supprimé' : SYSTEM_ACTOR),
        action:      entry.action,
        targetType:  entry.target?.type ?? null,
        targetId:    entry.target?.id ?? null,
        ipPrefix:    truncateIp(ip),
        userAgent:   summarizeUserAgent(entry.req?.headers.get('user-agent')),
        result:      entry.result ?? 'SUCCESS',
        details:     entry.details,
      },
    })
  } catch (err) {
    console.error(`[audit] could not record ${entry.action} for workspace ${actor.workspaceId}:`, err instanceof Error ? err.message : String(err))
  }
}

/**
 * The oldest instant still protected, minus a day of margin for the
 * database clock. Clamped like Postgres: 31 March minus 13 months is
 * 28 February, not 3 March (setUTCMonth would overflow, and the trigger
 * would then refuse the whole purge).
 */
export function auditRetentionCutoff(now: Date): Date {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() - AUDIT_RETENTION_MONTHS
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cutoff = new Date(Date.UTC(y, m, Math.min(now.getUTCDate(), lastDay),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()))
  cutoff.setUTCDate(cutoff.getUTCDate() - 1)
  return cutoff
}

/** Deletes the events past retention. The table refuses younger rows anyway. */
export async function purgeAuditEvents(db: Pick<PrismaClient, 'auditEvent'>, now = new Date()): Promise<number> {
  const cutoff = auditRetentionCutoff(now)
  const { count } = await db.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return count
}

export interface AuditPageQuery {
  workspaceId: string
  /** Cursor: the id of the last event of the previous page. */
  after?: string | null
  take?: number
  action?: string | null
}

export const AUDIT_EVENT_FIELDS = {
  id: true, actorLabel: true, action: true, targetType: true, targetId: true,
  ipPrefix: true, userAgent: true, result: true, details: true, createdAt: true,
} as const

/** Newest first, by cursor. */
export async function listAuditEvents(db: Pick<PrismaClient, 'auditEvent'>, q: AuditPageQuery) {
  const take = Math.min(Math.max(q.take ?? 50, 1), 200)
  const rows = await db.auditEvent.findMany({
    where:   { workspaceId: q.workspaceId, ...(q.action ? { action: q.action } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take:    take + 1,
    ...(q.after ? { cursor: { id: q.after }, skip: 1 } : {}),
    select:  AUDIT_EVENT_FIELDS,
  })
  return { events: rows.slice(0, take), next: rows.length > take ? rows[take - 1].id : null }
}
