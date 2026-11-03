import { describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  reverificationErrorResponse: (level: string) => Response.json(
    { clerk_error: { type: 'forbidden', reason: 'reverification-error', metadata: { reverification: level } } },
    { status: 403 },
  ),
}))

import { checkStepUp, requireStepUp, type StepUpDeps } from './step-up'

const ctx = { workspaceId: 'ws1', clerkUserId: 'user_1', userId: 'u1' }

function setup(opts: { requireTwoFactor: boolean; recent: boolean; enrolled: boolean }) {
  const db = {
    workspace:  { findUnique: vi.fn().mockResolvedValue({ requireTwoFactor: opts.requireTwoFactor }) },
    user:       { findUnique: vi.fn().mockResolvedValue({ email: 'ayoub@example.com' }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  }
  const deps: StepUpDeps = {
    verifiedRecently: vi.fn().mockResolvedValue(opts.recent),
    twoFactorEnabled: vi.fn().mockResolvedValue(opts.enrolled),
  }
  return { db: db as never, raw: db, deps }
}

describe('step-up before a sensitive action', () => {
  it('goes ahead after a recent verification', async () => {
    const { db, deps } = setup({ requireTwoFactor: false, recent: true, enrolled: false })
    expect(await checkStepUp(db, ctx, deps)).toBe('OK')
    expect(await requireStepUp(db, ctx, { deps })).toBeNull()
    expect(deps.twoFactorEnabled).not.toHaveBeenCalled()
  })

  it('asks Clerk to verify again when the last verification is old', async () => {
    const { db, deps } = setup({ requireTwoFactor: false, recent: false, enrolled: true })
    const res = await requireStepUp(db, ctx, { deps })
    expect(res?.status).toBe(403)
    expect(await res?.json()).toMatchObject({ clerk_error: { reason: 'reverification-error', metadata: { reverification: 'strict' } } })
  })

  it('refuses a member without a second factor when the team requires it, before any reverification', async () => {
    const { db, deps } = setup({ requireTwoFactor: true, recent: true, enrolled: false })
    const res = await requireStepUp(db, ctx, { deps })
    expect(res?.status).toBe(403)
    expect(await res?.json()).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' })
    expect(deps.verifiedRecently).not.toHaveBeenCalled()
  })

  it('lets an enrolled member through the team rule, still subject to recency', async () => {
    const { db, deps } = setup({ requireTwoFactor: true, recent: false, enrolled: true })
    expect(await checkStepUp(db, ctx, deps)).toBe('REVERIFY')
    expect(deps.twoFactorEnabled).toHaveBeenCalledWith('user_1')
  })

  it('records the team-rule refusal as DENIED, not the routine reverification', async () => {
    const denied = setup({ requireTwoFactor: true, recent: true, enrolled: false })
    await requireStepUp(denied.db, ctx, { deps: denied.deps, deny: { action: 'member.role_changed', target: { type: 'user', id: 'u2' } } })
    expect(denied.raw.auditEvent.create.mock.calls[0][0].data).toMatchObject({ action: 'member.role_changed', result: 'DENIED', details: { reason: 'two_factor_required' } })

    const stale = setup({ requireTwoFactor: false, recent: false, enrolled: true })
    await requireStepUp(stale.db, ctx, { deps: stale.deps, deny: { action: 'member.role_changed' } })
    expect(stale.raw.auditEvent.create).not.toHaveBeenCalled()
  })

  it('lets an owner without a second factor turn the team rule off (recency only)', async () => {
    const { db, deps } = setup({ requireTwoFactor: true, recent: true, enrolled: false })
    expect(await requireStepUp(db, ctx, { deps, recencyOnly: true })).toBeNull()
    expect(deps.twoFactorEnabled).not.toHaveBeenCalled()
  })
})
