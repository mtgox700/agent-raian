import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { returnPath, safeReturnPath, signedOutResponse } from './signed-out'

const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(new URL(path, 'https://app.test'), { headers })

describe('signedOutResponse', () => {
  it('a page load goes to sign-in, with the way back', () => {
    const res = signedOutResponse(req('/dashboard/leads/hot', { 'sec-fetch-dest': 'document', accept: 'text/html' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://app.test/sign-in?redirect_url=https%3A%2F%2Fapp.test%2Fdashboard%2Fleads%2Fhot')
  })

  it('a client navigation gets a non-RSC 401, so the router reloads the page and Clerk refreshes the session', async () => {
    for (const headers of [{ 'sec-fetch-dest': 'empty' }, { accept: '*/*' }, {}]) {
      const res = signedOutResponse(req('/dashboard/campaigns', headers))
      expect(res.status).toBe(401)
      expect(res.headers.get('content-type')).not.toContain('text/x-component')
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('a browser without Sec-Fetch-Dest is judged on Accept', () => {
    expect(signedOutResponse(req('/dashboard', { accept: 'text/html,application/xhtml+xml' })).status).toBe(307)
  })

  it('an API call gets JSON, never the sign-in page', async () => {
    const res = signedOutResponse(req('/api/touches/queue?count=1'))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'session_expired' })
  })
})

describe('isServerAction', () => {
  it('recognises a server action POST, nothing else', async () => {
    const { isServerAction } = await import('./signed-out')
    expect(isServerAction(new NextRequest('https://app.test/dashboard', { method: 'POST', headers: { 'next-action': 'abc' } }))).toBe(true)
    expect(isServerAction(new NextRequest('https://app.test/dashboard', { method: 'POST' }))).toBe(false)
    expect(isServerAction(new NextRequest('https://app.test/dashboard', { headers: { 'next-action': 'abc' } }))).toBe(false)
  })
})

describe('returnPath: where a signed-in visit to /sign-in goes', () => {
  const at = (query: string) => returnPath(req(`/sign-in${query}`))

  it('the page the session expired on, absolute or relative', () => {
    expect(at('?redirect_url=https%3A%2F%2Fapp.test%2Fdashboard%2Fanalytics%3Fperiod%3D90')).toBe('/dashboard/analytics?period=90')
    expect(at('?redirect_url=%2Finvite%2Fabc')).toBe('/invite/abc')
  })

  it('never another site: the dashboard instead', () => {
    for (const bad of ['https://evil.test/x', '//evil.test/x', '/\\evil.test', '\\\\evil.test', 'javascript:alert(1)', 'http://app.test.evil.test/', 'https://app.test@evil.test/']) {
      expect(at(`?redirect_url=${encodeURIComponent(bad)}`)).toBe('/dashboard')
    }
  })

  it('never back to sign-in or sign-up (a loop), nor nowhere', () => {
    expect(at('?redirect_url=%2Fsign-in%3Fredirect_url%3D%2Fdashboard')).toBe('/dashboard')
    expect(at('?redirect_url=%2Fsign-up')).toBe('/dashboard')
    expect(at('')).toBe('/dashboard')
  })
})

describe('safeReturnPath: the same rule for the sign-in page itself', () => {
  it('follows a path of this origin, refuses the rest', () => {
    expect(safeReturnPath('https://app.test/dashboard/analytics?p=90d', 'https://app.test')).toBe('/dashboard/analytics?p=90d')
    expect(safeReturnPath('https://evil.test/x', 'https://app.test')).toBe('/dashboard')
    expect(safeReturnPath(undefined, 'https://app.test')).toBe('/dashboard')
    expect(safeReturnPath(['/a', '/b'], 'https://app.test')).toBe('/dashboard')
  })
})
