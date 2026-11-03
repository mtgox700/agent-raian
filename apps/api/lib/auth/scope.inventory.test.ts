/**
 * A route or page reached by a member must filter campaigns, leads, replies,
 * sends, mailboxes, channels, touches and notifications through lib/auth/scope,
 * not by workspace alone: a workspace-wide filter shows a member their
 * colleagues' rows. The few workspace-wide reads left are listed with why.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const rel = (file: string) => relative(ROOT, file).split(sep).join('/')

/** Workspace-wide on purpose. */
const ALLOWED: Record<string, string> = {
  'app/api/mailbox/debug-sends/route.ts':              'settings.manage only (OWNER, ADMIN see everything)',
  'app/api/leads/diagnose/route.ts':                   'settings.manage only (OWNER, ADMIN see everything)',
  'app/api/mailbox/diagnostic/route.ts':               'settings.manage only (OWNER, ADMIN see everything)',
}

const SCOPED_MODELS = 'campaign|lead|emailReply|emailSend|connectedMailbox|connectedChannel|leadTouch|notification'
// `where: { workspaceId }`, `where: { workspaceId: x.workspaceId, … }` or `where: { campaign: { workspaceId } }`
// as the whole filter of a read or bulk write on one of those tables.
const WORKSPACE_ONLY = new RegExp(
  `db\\.(${SCOPED_MODELS})\\.(findMany|findFirst|count|groupBy|aggregate|updateMany|deleteMany)\\(\\{\\s*` +
  `where:\\s*\\{\\s*(campaign:\\s*\\{\\s*)?workspaceId(:\\s*[\\w.]+)?\\s*\\}`,
  'g',
)

function offenders(source: string): string[] {
  return [...source.matchAll(WORKSPACE_ONLY)].map((m) => m[0].replace(/\s+/g, ' '))
}

// Reads every source file: slow on a cold disk, so a generous timeout.
describe('scope inventory', { timeout: 60_000 }, () => {
  it('detects a workspace-only filter, and not a scoped one', () => {
    expect(offenders('db.lead.findMany({ where: { workspaceId } })')).toHaveLength(1)
    expect(offenders('db.campaign.count({\n  where: { workspaceId: workspace.workspaceId },\n})')).toHaveLength(1)
    expect(offenders('db.emailReply.findMany({ where: { campaign: { workspaceId } } })')).toHaveLength(1)
    expect(offenders('db.lead.findMany({ where: leadScope(workspace) })')).toEqual([])
    expect(offenders('db.campaign.findFirst({ where: { id: campaignId, ...campaignScope(workspace) } })')).toEqual([])
  })

  it('no route, action or page reached by members filters those tables by workspace alone', () => {
    const files = walk(join(ROOT, 'app')).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
    const memberFacing = files.filter((f) => /\b(requireAccess|loadAccess)\(/.test(readFileSync(f, 'utf8')))
    const found = memberFacing
      .filter((f) => !ALLOWED[rel(f)])
      .flatMap((f) => offenders(readFileSync(f, 'utf8')).map((o) => `${rel(f)}: ${o}`))
    expect(found).toEqual([])
  })

  it('lists no allowance for a file that no longer exists', () => {
    const existing = new Set(walk(join(ROOT, 'app')).map(rel))
    expect(Object.keys(ALLOWED).filter((p) => !existing.has(p))).toEqual([])
  })
})
