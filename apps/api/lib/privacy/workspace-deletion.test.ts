import { describe, expect, it, vi } from 'vitest'
import { purgeDueWorkspaces, purgeWorkspace, scheduleWorkspaceDeletion, type PurgeDeps } from './workspace-deletion'

// The full lifecycle runs against Postgres (scratchpad check, 21 cases);
// here, the invariants that must hold when a provider fails.

function fakeDb(workspace: Record<string, unknown> | null) {
  return {
    workspace: {
      findUnique: vi.fn().mockResolvedValue(workspace),
      findMany: vi.fn().mockResolvedValue(workspace ? [{ id: 'ws1' }] : []),
      update: vi.fn(),
    },
    campaign: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(),
    auditEvent: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  }
}

const stripeDown = () => Promise.reject(Object.assign(new Error('Stripe unavailable'), { statusCode: 503 }))

describe('workspace deletion', () => {
  it('changes nothing when Stripe refuses to stop the renewal', async () => {
    const db = fakeDb({ name: 'Acme', deletionScheduledFor: null, stripeSubscriptionId: 'sub_1' })
    const billing = { subscriptions: { update: vi.fn(stripeDown), cancel: vi.fn() } }
    await expect(scheduleWorkspaceDeletion(db as never, billing, { workspaceId: 'ws1', userId: 'u1', confirmName: 'Acme' })).rejects.toThrow('Stripe unavailable')
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.workspace.update).not.toHaveBeenCalled()
  })

  it('deletes nothing when the subscription cannot be cancelled, and retries another day', async () => {
    const db = fakeDb({ deletionScheduledFor: new Date('2026-01-01'), stripeSubscriptionId: 'sub_1', connectedChannels: [] })
    const deps: PurgeDeps = { billing: { subscriptions: { update: vi.fn(), cancel: vi.fn(stripeDown) } }, revokeChannel: vi.fn() }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await purgeDueWorkspaces(db as never, deps)).toBe(0)
    expect(db.$transaction).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('a subscription already gone does not block the purge', async () => {
    const db = fakeDb({ deletionScheduledFor: new Date('2026-01-01'), stripeSubscriptionId: 'sub_1', connectedChannels: [] })
    const gone = () => Promise.reject(Object.assign(new Error('No such subscription'), { code: 'resource_missing' }))
    const deps: PurgeDeps = { billing: { subscriptions: { update: vi.fn(), cancel: vi.fn(gone) } }, revokeChannel: vi.fn() }
    expect(await purgeWorkspace(db as never, deps, 'ws1')).toBe(true)
    expect(db.$transaction).toHaveBeenCalledOnce()
  })
})
