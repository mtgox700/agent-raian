import { describe, it, expect, vi, afterEach } from 'vitest'
import { POST } from './route'

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/security/redteam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('red-team endpoint gating (security)', () => {
  it('404s when ENABLE_REDTEAM is not set (default-off)', async () => {
    vi.stubEnv('ENABLE_REDTEAM', '')
    const res = await POST(post({ q: 'hello' }, { 'x-redteam-secret': 'topsecret' }))
    expect(res.status).toBe(404)
  })

  it('401s on bad secret when REDTEAM_SECRET is configured', async () => {
    vi.stubEnv('ENABLE_REDTEAM', '1')
    vi.stubEnv('REDTEAM_SECRET', 'topsecret')
    const res = await POST(post({ q: 'hello' }, { 'x-redteam-secret': 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('404s when enabled without a secret: never an open proxy', async () => {
    vi.stubEnv('ENABLE_REDTEAM', '1')
    vi.stubEnv('REDTEAM_SECRET', '')
    const res = await POST(post({ q: 'hello' }))
    expect(res.status).toBe(404)
  })

  it('503s when enabled+authorized but no LLM configured', async () => {
    vi.stubEnv('ENABLE_REDTEAM', '1')
    vi.stubEnv('REDTEAM_SECRET', 'topsecret')
    vi.stubEnv('OLLAMA_API_KEY', '') // not configured → mock guard
    const res = await POST(post({ q: 'hello' }, { 'x-redteam-secret': 'topsecret' }))
    expect(res.status).toBe(503)
  })

  it('422s on missing q when enabled+configured', async () => {
    vi.stubEnv('ENABLE_REDTEAM', '1')
    vi.stubEnv('REDTEAM_SECRET', 'topsecret')
    vi.stubEnv('OLLAMA_API_KEY', 'sk-test')
    const res = await POST(post({ notq: 'x' }, { 'x-redteam-secret': 'topsecret' }))
    expect(res.status).toBe(422)
  })
})
