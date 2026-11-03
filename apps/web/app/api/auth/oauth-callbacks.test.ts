/**
 * OAuth login CSRF: someone signs a connection link for their own workspace
 * and gets a victim to approve it. The callback must refuse unless the
 * session finishing the consent is the one that started it, before any
 * token is exchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  session: { userId: null as string | null },
  requireAccess: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: mocks.session.userId }) }))
vi.mock('@/lib/security/oauth-state', () => ({
  verifyOAuthState: () => ({ ok: true, payload: { workspaceId: 'ws_attacker', userId: 'user_attacker', iat: Date.now() } }),
}))
vi.mock('@/lib/auth/access', () => ({ requireAccess: mocks.requireAccess }))
vi.mock('@/lib/db', () => ({ db: {} }))

import { GET as gmailCallback } from './gmail/callback/route'
import { GET as outlookCallback } from './outlook/callback/route'

const request = (provider: string) => new NextRequest(`https://www.phantera-tn.com/api/auth/${provider}/callback?code=victim-code&state=signed-by-attacker`)

beforeEach(() => {
  mocks.requireAccess.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no token exchange expected') }))
})

describe.each([
  ['gmail', gmailCallback],
  ['outlook', outlookCallback],
])('%s callback', (provider, callback) => {
  it('refuses the victim session finishing an attacker-signed consent', async () => {
    mocks.session.userId = 'user_victim'
    const res = await callback(request(provider))
    expect(res.headers.get('location')).toContain('reason=unauthorized')
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.requireAccess).not.toHaveBeenCalled()
  })

  it('refuses a consent finished without any session', async () => {
    mocks.session.userId = null
    const res = await callback(request(provider))
    expect(res.headers.get('location')).toContain('reason=unauthorized')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lets the account that started the flow continue', async () => {
    mocks.session.userId = 'user_attacker'
    mocks.requireAccess.mockResolvedValue({ ok: false, status: 404, error: 'x' })
    await callback(request(provider))
    expect(mocks.requireAccess).toHaveBeenCalledWith('user_attacker', 'mailbox.connect', { workspaceId: 'ws_attacker' })
  })
})
