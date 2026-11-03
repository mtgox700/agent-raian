import { describe, it, expect, vi } from 'vitest'
import { createSdrApproval, listPendingApprovals, type ApprovalsDb } from './approvals'
import type { SdrPlan } from './orchestrator'

const plan: SdrPlan = {
  route: {
    type: 'FUNDING',
    playbook: 'funding-congrats',
    priority: 'HIGH',
    angle: 'a',
    euStatus: 'SAFE',
    euActionable: true,
  },
  action: 'AWAIT_APPROVAL',
  approvalReasons: ['FIRST_TOUCH'],
}

function makeDb(): ApprovalsDb {
  return {
    notification: {
      create: vi.fn(async () => ({ id: 'notif_1' })),
      findMany: vi.fn(async () => [
        { id: 'notif_1', data: { draft: { subject: 's' } }, leadId: 'l1', createdAt: new Date(0) },
      ]),
    },
  }
}

describe('createSdrApproval', () => {
  it('creates an SDR_APPROVAL_NEEDED notification with the draft in data', async () => {
    const db = makeDb()
    const id = await createSdrApproval(db, {
      workspaceId: 'ws_1',
      leadId: 'l1',
      leadName: 'Jean Dupont',
      plan,
      draft: { subject: 'Hi', body: 'x', channel: 'email' },
    })
    expect(id).toBe('notif_1')
    const arg = (db.notification.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.data.type).toBe('SDR_APPROVAL_NEEDED')
    expect(arg.data.workspaceId).toBe('ws_1')
    expect(arg.data.leadId).toBe('l1')
    expect(arg.data.data.playbook).toBe('funding-congrats')
    expect(arg.data.data.draft.subject).toBe('Hi')
    expect(arg.data.data.approvalReasons).toEqual(['FIRST_TOUCH'])
  })

  it('falls back gracefully when no lead name/id', async () => {
    const db = makeDb()
    await createSdrApproval(db, { workspaceId: 'ws_1', plan, draft: { subject: 's', body: 'b', channel: 'linkedin' } })
    const arg = (db.notification.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.data.leadId).toBeNull()
    expect(arg.data.body).toContain('un lead')
  })
})

describe('listPendingApprovals', () => {
  it('queries unread SDR approvals for the workspace', async () => {
    const db = makeDb()
    const rows = await listPendingApprovals(db, 'ws_1')
    expect(rows).toHaveLength(1)
    const arg = (db.notification.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.where).toEqual({ workspaceId: 'ws_1', type: 'SDR_APPROVAL_NEEDED', readAt: null })
    expect(arg.orderBy).toEqual({ createdAt: 'desc' })
  })
})
