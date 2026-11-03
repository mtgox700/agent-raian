import { ApiError, createClient } from '@phantera/sdk'

function fakeFetch(answer: { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('@phantera/sdk', () => {
  it('builds the URL from path params and query, and sends the JSON body', async () => {
    const { fn, calls } = fakeFetch({ body: { ok: true, lead: { id: 'l1', status: 'qualified', doNotContact: false } } })
    const api = createClient({ fetch: fn, validateResponses: false })
    await api.call('leads.updateStatus', { params: { leadId: 'l 1' }, body: { status: 'qualified' } })
    expect(calls[0].url).toBe('/api/leads/l%201/status')
    expect(calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ status: 'qualified' })
  })

  it('drops undefined query values', () => {
    const api = createClient()
    expect(api.url('leads.list', { query: { workspaceId: 'w1', q: undefined } })).toBe('/api/leads?workspaceId=w1')
  })

  it('rejects an input that breaks the contract before any request', async () => {
    const { fn, calls } = fakeFetch({ body: {} })
    const api = createClient({ fetch: fn })
    // @ts-expect-error status is not in the enum
    await expect(api.call('leads.updateStatus', { params: { leadId: 'l1' }, body: { status: 'won' } })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('throws ApiError with the error body on a non-2xx answer', async () => {
    const { fn } = fakeFetch({ status: 404, body: { error: 'Lead introuvable.' } })
    const api = createClient({ fetch: fn })
    const err = await api.call('leads.updateStatus', { params: { leadId: 'l1' }, body: { status: 'lost' } }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Lead introuvable.')
  })

  it('reports an answer that does not match the contract without failing the call', async () => {
    const { fn } = fakeFetch({ body: { success: true, data: 'not a list', total: 1 } })
    const mismatches: string[] = []
    const api = createClient({ fetch: fn, validateResponses: true, onContractMismatch: (id) => mismatches.push(id) })
    await api.call('leads.list', { query: { workspaceId: 'w1' } })
    expect(mismatches).toEqual(['leads.list'])
  })

  it('routes step-up endpoints through stepUpFetch', async () => {
    const plain = fakeFetch({ body: {} })
    const stepUp = fakeFetch({ body: { ok: true } })
    const api = createClient({ fetch: plain.fn, stepUpFetch: stepUp.fn, validateResponses: false })
    await api.call('channels.disconnect', { params: { channelId: 'c1' } })
    expect(stepUp.calls).toHaveLength(1)
    expect(plain.calls).toHaveLength(0)
  })
})
