/**
 * GET /api/security/audit: the workspace's audit log, newest first.
 *   ?after=<id>&action=<action>      a page of 50 (JSON)
 *   ?format=csv                      the whole retained log as CSV
 *
 * Owners and admins only. The CSV goes through lib/export/csv, which
 * neutralises cells that would run as spreadsheet formulas: actor labels
 * and details come from user input. The export itself is recorded.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { listAuditEvents, recordAudit } from '@/lib/audit/audit'
import { AUDIT_ACTIONS, auditLabel } from '@/lib/audit/actions'
import { toCsv } from '@/lib/export/csv'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 13 months of a busy workspace stays far below this. */
const CSV_MAX_ROWS = 50_000

const RESULT_LABEL: Record<string, string> = { SUCCESS: 'Réussi', DENIED: 'Refusé', FAILURE: 'Échec' }

export async function GET(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'audit.read')
  if (!access.ok) return accessDenied(access)
  const { ctx } = access

  const url = new URL(req.url)
  const actionParam = url.searchParams.get('action')
  const action = actionParam && Object.hasOwn(AUDIT_ACTIONS, actionParam) ? actionParam : null

  if (url.searchParams.get('format') !== 'csv') {
    const page = await listAuditEvents(db, { workspaceId: ctx.workspaceId, after: url.searchParams.get('after'), action })
    return NextResponse.json({
      events: page.events.map((e) => ({ ...e, label: auditLabel(e.action) })),
      next:   page.next,
    })
  }

  const throttle = await limit(`ws:${ctx.workspaceId}`, { windowSec: 3600, max: 10, scope: 'audit-export' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop d’exports : réessayez dans une heure.' }, { status: 429 })

  const rows: (string | null)[][] = []
  let after: string | null = null
  do {
    const page = await listAuditEvents(db, { workspaceId: ctx.workspaceId, after, action, take: 200 })
    for (const e of page.events) {
      rows.push([
        e.createdAt.toISOString(), e.actorLabel, auditLabel(e.action),
        e.targetType ? `${e.targetType}${e.targetId ? `:${e.targetId}` : ''}` : null,
        RESULT_LABEL[e.result] ?? e.result, e.ipPrefix, e.userAgent,
        e.details ? JSON.stringify(e.details) : null,
      ])
    }
    after = page.next
  } while (after && rows.length < CSV_MAX_ROWS)

  await recordAudit(db, ctx, { action: 'security.audit_exported', target: { type: 'workspace', id: ctx.workspaceId }, req, details: { rows: rows.length } })

  const csv = toCsv(['Date (UTC)', 'Acteur', 'Action', 'Cible', 'Résultat', 'Réseau', 'Navigateur', 'Détails'], rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="journal-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control':       'no-store',
    },
  })
}
