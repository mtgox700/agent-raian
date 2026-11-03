/**
 * The one door to workspace data. Every route, server action and page asks
 * requireAccess for a permission; it answers with the caller's workspace and
 * role, or with a typed refusal.
 *
 * - 401: not signed in.
 * - 404: no workspace for this user, or a workspace they are not a member of
 *        (never revealing that it exists).
 * - 403: a member whose role does not allow the action.
 *
 * Membership is read from WorkspaceMember. Owners from before memberships
 * existed are treated as OWNER of the workspaces they own, so nothing that
 * worked before stops working.
 */

import * as React from 'react'
import { NextResponse } from 'next/server'
import type { Plan, PrismaClient, TargetCompanySize, WorkspaceRole } from '@prisma/client'
import { can, type Permission } from './permissions'
import { ACTIVE_WORKSPACE_COOKIE, readActiveWorkspace } from './active-workspace'

export interface AccessContext {
  /** Internal user id (User.id). */
  userId: string
  clerkUserId: string
  workspaceId: string
  role: WorkspaceRole
  /** WorkspaceMember.id, or `owner:<workspaceId>` for a legacy owner without a row. */
  membershipId: string
  plan: Plan
  targetIndustry: string | null
  targetCompanySize: TargetCompanySize | null
  sendingDomain: string | null
}

export type AccessResult =
  | { ok: true; ctx: AccessContext }
  | { ok: false; status: 401 | 403 | 404; error: string }

export const ACCESS_ERRORS = {
  401: 'Session expirée : reconnectez-vous.',
  403: 'Votre rôle dans cet espace ne permet pas cette action.',
  404: 'Espace de travail introuvable.',
} as const

type Db = Pick<PrismaClient, 'user'>

const WORKSPACE_FIELDS = {
  id: true, name: true, plan: true, targetIndustry: true, targetCompanySize: true, sendingDomain: true, createdAt: true,
} as const

interface Candidate {
  workspaceId: string
  role: WorkspaceRole
  membershipId: string
  createdAt: Date
  workspace: { name: string; plan: Plan; targetIndustry: string | null; targetCompanySize: TargetCompanySize | null; sendingDomain: string | null }
}

/**
 * The workspaces a user can act in. Memberships are the source of truth; a
 * workspace owned with no membership row at all (created before memberships)
 * counts as OWNER. When a row exists its role wins, so an owner who has been
 * changed to another role keeps that role.
 */
async function candidates(db: Db, clerkUserId: string, onlyWorkspaceId?: string | null): Promise<{ userId: string; list: Candidate[] } | null> {
  const scope = onlyWorkspaceId ? { workspaceId: onlyWorkspaceId } : {}
  const user = await db.user.findUnique({
    where:  { clerkId: clerkUserId },
    select: {
      id: true,
      workspaces: {
        where:   scope,
        select:  { id: true, role: true, workspaceId: true, workspace: { select: WORKSPACE_FIELDS } },
        orderBy: { createdAt: 'asc' },
      },
      ownedWorkspaces: {
        where:   onlyWorkspaceId ? { id: onlyWorkspaceId } : {},
        select:  WORKSPACE_FIELDS,
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!user) return null

  const list: Candidate[] = user.workspaces.map((m) => ({
    workspaceId: m.workspaceId, role: m.role, membershipId: m.id, createdAt: m.workspace.createdAt, workspace: m.workspace,
  }))
  for (const ws of user.ownedWorkspaces) {
    if (list.some((c) => c.workspaceId === ws.id)) continue
    list.push({ workspaceId: ws.id, role: 'OWNER', membershipId: `owner:${ws.id}`, createdAt: ws.createdAt, workspace: ws })
  }
  return { userId: user.id, list }
}

function pick(list: Candidate[], wanted: string | null | undefined, active: string | null): Candidate | null {
  if (wanted) return list.find((c) => c.workspaceId === wanted) ?? null
  if (active) {
    const chosen = list.find((c) => c.workspaceId === active)
    if (chosen) return chosen
  }
  // Default: the oldest workspace the user owns, else the oldest membership.
  const owned = list.filter((c) => c.role === 'OWNER').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  return owned[0] ?? list[0] ?? null
}

async function cookieWorkspace(clerkUserId: string): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers')
    const store = await cookies()
    return readActiveWorkspace(clerkUserId, store.get(ACTIVE_WORKSPACE_COOKIE)?.value)
  } catch {
    // Outside a request (scripts, tests, background jobs): no active choice.
    return null
  }
}

export interface AccessOptions {
  /** A workspace named by the request (body, query, OAuth state). Must be one the user belongs to. */
  workspaceId?: string | null
  db?: Db
  /** Skip the cookie lookup (tests, background contexts). */
  activeWorkspaceId?: string | null
}

/**
 * One lookup per request for the same user and workspace: the layout, the
 * page and their data loaders all ask, the database answers once.
 */
const requestCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn) // cache exists in the React server build only
const loadForRequest = requestCache((clerkUserId: string, workspaceId: string | null) =>
  resolveAccess(clerkUserId, { workspaceId }))

/** The caller's workspace and role, whatever the permission. Null when they have none. */
export async function loadAccess(clerkUserId: string, opts: AccessOptions = {}): Promise<AccessContext | null> {
  if (!opts.db && opts.activeWorkspaceId === undefined) return loadForRequest(clerkUserId, opts.workspaceId ?? null)
  return resolveAccess(clerkUserId, opts)
}

async function resolveAccess(clerkUserId: string, opts: AccessOptions): Promise<AccessContext | null> {
  const db = opts.db ?? (await import('@/lib/db')).db
  const found = await candidates(db, clerkUserId, opts.workspaceId)
  if (!found) return null
  const active = opts.activeWorkspaceId !== undefined ? opts.activeWorkspaceId : await cookieWorkspace(clerkUserId)
  const chosen = pick(found.list, opts.workspaceId, active)
  if (!chosen) return null
  return {
    userId:            found.userId,
    clerkUserId,
    workspaceId:       chosen.workspaceId,
    role:              chosen.role,
    membershipId:      chosen.membershipId,
    plan:              chosen.workspace.plan,
    targetIndustry:    chosen.workspace.targetIndustry,
    targetCompanySize: chosen.workspace.targetCompanySize,
    sendingDomain:     chosen.workspace.sendingDomain,
  }
}

/** Every workspace the user belongs to, for the workspace switcher. */
export async function listMyWorkspaces(
  clerkUserId: string,
  opts: { db?: Db } = {},
): Promise<Array<{ workspaceId: string; name: string; role: WorkspaceRole }>> {
  const db = opts.db ?? (await import('@/lib/db')).db
  const found = await candidates(db, clerkUserId)
  return (found?.list ?? [])
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((c) => ({ workspaceId: c.workspaceId, name: c.workspace.name, role: c.role }))
}

export async function requireAccess(
  clerkUserId: string | null | undefined,
  permission: Permission,
  opts: AccessOptions = {},
): Promise<AccessResult> {
  if (!clerkUserId) return { ok: false, status: 401, error: ACCESS_ERRORS[401] }
  const ctx = await loadAccess(clerkUserId, opts)
  if (!ctx) return { ok: false, status: 404, error: ACCESS_ERRORS[404] }
  if (!can(ctx.role, permission)) return { ok: false, status: 403, error: ACCESS_ERRORS[403] }
  return { ok: true, ctx }
}

/** The JSON refusal for a route. */
export function accessDenied(result: Extract<AccessResult, { ok: false }>): NextResponse {
  return NextResponse.json({ error: result.error }, { status: result.status })
}
