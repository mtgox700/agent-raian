import { describe, it, expect, vi, afterEach } from 'vitest'
import { isUnipileConfigured, sendLinkedInMessage, sendUnipileEmail } from './unipile'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function setup(payload: unknown, ok = true) {
  vi.stubEnv('UNIPILE_DSN', 'https://api1.unipile.com:13111')
  vi.stubEnv('UNIPILE_API_KEY', 'k')
  const f = vi.fn().mockResolvedValue({ ok, json: async () => payload, text: async () => 'err' })
  vi.stubGlobal('fetch', f)
  return f
}

describe('isUnipileConfigured', () => {
  it('requires both DSN and key', () => {
    vi.stubEnv('UNIPILE_DSN', '')
    vi.stubEnv('UNIPILE_API_KEY', '')
    expect(isUnipileConfigured()).toBe(false)
    vi.stubEnv('UNIPILE_DSN', 'https://x')
    vi.stubEnv('UNIPILE_API_KEY', 'k')
    expect(isUnipileConfigured()).toBe(true)
  })
})

describe('sendLinkedInMessage', () => {
  it('posts to /chats with account + attendee + text and parses the id', async () => {
    const f = setup({ message_id: 'msg_1' })
    const r = await sendLinkedInMessage({ accountId: 'acc', recipientProviderId: 'lead', text: 'hi' })
    expect(r).toEqual({ providerMessageId: 'msg_1', channel: 'linkedin' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api1.unipile.com:13111/api/v1/chats')
    expect(init.headers['X-API-KEY']).toBe('k')
    expect(JSON.parse(init.body)).toEqual({ account_id: 'acc', attendees_ids: ['lead'], text: 'hi' })
  })

  it('throws on non-ok', async () => {
    setup({}, false)
    await expect(sendLinkedInMessage({ accountId: 'a', recipientProviderId: 'l', text: 't' })).rejects.toThrow(/Unipile/)
  })
})

describe('sendUnipileEmail', () => {
  it('posts to /emails with the recipient shape', async () => {
    const f = setup({ email_id: 'e_1' })
    const r = await sendUnipileEmail({ accountId: 'acc', to: 'jean@acme.com', subject: 'Hi', body: '<p>x</p>' })
    expect(r).toEqual({ providerMessageId: 'e_1', channel: 'email' })
    const body = JSON.parse(f.mock.calls[0][1].body)
    expect(body.to).toEqual([{ display_name: 'jean@acme.com', identifier: 'jean@acme.com' }])
    expect(body.subject).toBe('Hi')
  })
})
