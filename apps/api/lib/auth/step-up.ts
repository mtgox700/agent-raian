/**
 * Step-up for sensitive actions: deleting data, a full export, changing a
 * role, connecting a mailbox or channel, setting an API key.
 *
 * 1. Team two-factor. When the workspace owner turned on « 2FA obligatoire »,
 *    the member must have a second factor enrolled on their account.
 *    Checked against Clerk on each sensitive action, not trusted from the
 *    client, and refused with TWO_FACTOR_REQUIRED (the UI sends them to
 *    their profile to enrol).
 * 2. Recent verification. The session must have verified its factors in
 *    the last 10 minutes (Clerk's "strict": the second factor when the user
 *    has one, the first otherwise). Otherwise Clerk's reverification error
 *    is returned, and useReverification on the client opens the
 *    verification dialog and replays the request.
 *
 * Clerk's session token lifetime and revocation are documented in
 * .war-room/security/SESSIONS.md.
 */

import { auth, clerkClient, reverificationErrorResponse } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import type { AccessContext } from './access'
import { recordAudit, type AuditEntry } from '@/lib/audit/audit'

export const STEP_UP_LEVEL = 'strict' as const

export const TWO_FACTOR_REQUIRED = {
  code:  'TWO_FACTOR_REQUIRED',
  error: 'Votre espace exige la double authentification. Activez-la dans votre profil (menu de votre compte › Sécurité), puis réessayez.',
} as const

export interface StepUpDeps {
  /** Did the session verify its factors recently enough? */
  verifiedRecently(): Promise<boolean>
  /** Has the user enrolled a second factor? */
  twoFactorEnabled(clerkUserId: string): Promise<boolean>
}

const clerkDeps: StepUpDeps = {
  async verifiedRecently() {
    const { has } = await auth()
    return has({ reverification: STEP_UP_LEVEL })
  },
  async twoFactorEnabled(clerkUserId) {
    const client = await clerkClient()
    const user = await client.users.getUser(clerkUserId)
    return user.twoFactorEnabled
  },
}

export type StepUpOutcome = 'OK' | 'TWO_FACTOR_REQUIRED' | 'REVERIFY'

export interface StepUpOptions {
  deps?: StepUpDeps
  /**
   * Recency only, without the team rule: turning the team option OFF must
   * stay possible for an owner who lost their own second factor.
   */
  recencyOnly?: boolean
  /** Recorded as DENIED when the team rule refuses the action. */
  deny?: AuditEntry
}

export async function checkStepUp(
  db: Pick<PrismaClient, 'workspace'>,
  ctx: Pick<AccessContext, 'workspaceId' | 'clerkUserId'>,
  deps: StepUpDeps = clerkDeps,
  recencyOnly = false,
): Promise<StepUpOutcome> {
  if (!recencyOnly) {
    const workspace = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { requireTwoFactor: true } })
    if (workspace?.requireTwoFactor && !(await deps.twoFactorEnabled(ctx.clerkUserId))) return 'TWO_FACTOR_REQUIRED'
  }
  if (!(await deps.verifiedRecently())) return 'REVERIFY'
  return 'OK'
}

/** The refusal to return, or null to go ahead. */
export async function requireStepUp(
  db: Pick<PrismaClient, 'workspace' | 'auditEvent' | 'user'>,
  ctx: Pick<AccessContext, 'workspaceId' | 'clerkUserId' | 'userId'>,
  opts: StepUpOptions = {},
): Promise<NextResponse | null> {
  const outcome = await checkStepUp(db, ctx, opts.deps ?? clerkDeps, opts.recencyOnly)
  // A missing second factor is a policy refusal worth a trace; an expired
  // verification is the normal flow (the dialog opens) and is not logged.
  if (outcome === 'TWO_FACTOR_REQUIRED') {
    if (opts.deny) await recordAudit(db, ctx, { ...opts.deny, result: 'DENIED', details: { ...opts.deny.details, reason: 'two_factor_required' } })
    return NextResponse.json(TWO_FACTOR_REQUIRED, { status: 403 })
  }
  if (outcome === 'REVERIFY') return reverificationErrorResponse(STEP_UP_LEVEL) as NextResponse
  return null
}
