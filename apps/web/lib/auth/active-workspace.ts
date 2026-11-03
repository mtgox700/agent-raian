/**
 * The workspace a member of several workspaces is working in, kept in a
 * signed cookie. The cookie only expresses a choice: every request re-checks
 * the membership, so a forged or stale value never grants anything.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const ACTIVE_WORKSPACE_COOKIE = 'phantera_ws'
export const ACTIVE_WORKSPACE_MAX_AGE = 60 * 60 * 24 * 180

function secret(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY not set')
  return Buffer.from(`active-workspace:${key}`, 'utf8')
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** "<workspaceId>.<sig>", the signature covering the user: another account cannot reuse it. */
export function signActiveWorkspace(clerkUserId: string, workspaceId: string): string {
  return `${workspaceId}.${sign(`${clerkUserId}:${workspaceId}`)}`
}

export function readActiveWorkspace(clerkUserId: string, value: string | undefined | null): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const workspaceId = value.slice(0, dot)
  if (!/^[a-z0-9]{10,40}$/i.test(workspaceId)) return null
  const given = Buffer.from(value.slice(dot + 1))
  let expected: Buffer
  try {
    expected = Buffer.from(sign(`${clerkUserId}:${workspaceId}`))
  } catch {
    return null
  }
  return given.length === expected.length && timingSafeEqual(given, expected) ? workspaceId : null
}
