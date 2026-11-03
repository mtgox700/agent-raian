import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  recordOptOut: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { emailSend: { findUnique: mocks.findUnique } } }))
// The erasure itself is proven against Postgres (lib/privacy/opt-out); here,
// that the route asks for it, for the right workspace and address only.
vi.mock('@/lib/privacy/opt-out', () => ({ recordOptOut: mocks.recordOptOut }))

import { GET, POST } from './route'

const SID = 'cm1abcdefghijklmnop'
const url = (q: string) => `https://www.phantera-tn.com/api/webhooks/unsubscribe${q}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUnique.mockResolvedValue({ leadId: 'lead1', lead: { email: 'Jeanne@Client.fr' }, campaign: { workspaceId: 'ws1' } })
  mocks.recordOptOut.mockResolvedValue({ anonymisedLeads: 1 })
})

describe('unsubscribe', () => {
  it('GET only shows a confirmation: link scanners must not unsubscribe anyone', async () => {
    const res = await GET(new NextRequest(url(`?sid=${SID}`)))
    expect(await res.text()).toContain('Confirmer le désabonnement')
    expect(mocks.recordOptOut).not.toHaveBeenCalled()
  })

  it('POST records the objection of that address, to the sender’s workspace', async () => {
    await POST(new NextRequest(url(`?sid=${SID}`), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(mocks.recordOptOut).toHaveBeenCalledWith(expect.anything(), { workspaceId: 'ws1', email: 'Jeanne@Client.fr', source: 'UNSUBSCRIBE' })
  })

  it('still confirms to the prospect if the erasure fails (it is logged, and retried by a new click)', async () => {
    mocks.recordOptOut.mockRejectedValue(new Error('db down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(new NextRequest(url(`?sid=${SID}`), { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('ignores the legacy email parameter that used to unsubscribe across all workspaces', async () => {
    await POST(new NextRequest(url('?email=victim%40corp.fr'), { method: 'POST' }))
    expect(mocks.recordOptOut).not.toHaveBeenCalled()
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('rejects malformed send ids without touching the database', async () => {
    await POST(new NextRequest(url('?sid=%27%20OR%201%3D1'), { method: 'POST' }))
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('answers with a page when the confirmation button is used', async () => {
    const res = await POST(new NextRequest(url(`?sid=${SID}`), { method: 'POST', headers: { accept: 'text/html' } }))
    expect(await res.text()).toContain('Désabonnement confirmé')
  })
})
