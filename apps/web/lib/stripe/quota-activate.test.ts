import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), count: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { workspace: { findUnique: mocks.findUnique }, campaign: { count: mocks.count } } }))

import { canActivateCampaign } from './quota'

beforeEach(() => vi.clearAllMocks())

describe('canActivateCampaign', () => {
  it('refuses to resume a paused campaign beyond the plan limit (downgrade bypass)', async () => {
    mocks.findUnique.mockResolvedValue({ plan: 'FREE' })
    mocks.count.mockResolvedValue(1)
    const r = await canActivateCampaign('ws1', 'c2')
    expect(r.allowed).toBe(false)
    expect(mocks.count).toHaveBeenCalledWith({ where: { workspaceId: 'ws1', status: 'ACTIVE', id: { not: 'c2' } } })
  })

  it('allows resuming within the limit', async () => {
    mocks.findUnique.mockResolvedValue({ plan: 'FREE' })
    mocks.count.mockResolvedValue(0)
    expect((await canActivateCampaign('ws1', 'c2')).allowed).toBe(true)
  })

  it('never limits unlimited plans', async () => {
    mocks.findUnique.mockResolvedValue({ plan: 'BUSINESS' })
    expect((await canActivateCampaign('ws1', 'c2')).allowed).toBe(true)
    expect(mocks.count).not.toHaveBeenCalled()
  })
})
