import { describe, expect, it } from 'vitest'
import { classifyProviderThrottle, DAILY_LIMIT_PAUSE_MS, RATE_LIMIT_PAUSE_MS } from './provider-throttle'

describe('classifyProviderThrottle', () => {
  it.each([
    'Gmail API error (403): Daily user sending limit exceeded',
    '550 5.4.5 Daily sending quota exceeded',
    'Graph error: ErrorExceededMessageLimit',
  ])('pauses for hours on a daily limit: %s', (message) => {
    expect(classifyProviderThrottle(message)).toEqual({ kind: 'daily', pauseMs: DAILY_LIMIT_PAUSE_MS })
  })

  it.each([
    'Gmail API error (429): userRateLimitExceeded',
    '421 4.7.0 Try again later, closing connection',
    '451 4.7.1 Rate limit exceeded for this sender',
    'Request failed with status 429',
    'Too many messages, slow down',
    'Graph error: ApplicationThrottled',
  ])('backs off a few minutes on a rate limit: %s', (message) => {
    expect(classifyProviderThrottle(message)).toEqual({ kind: 'rate', pauseMs: RATE_LIMIT_PAUSE_MS })
  })

  it.each([
    '550 5.1.1 The email account that you tried to reach does not exist',
    'Invalid credentials',
    'connect ECONNREFUSED 127.0.0.1:587',
    'Mailbox token expired',
    '452 4.2.2 The email account that you tried to reach is over quota',
    '450 4.2.0 Greylisted, please try again later',
    'Message-ID <429.abc@client.fr> rejected',
  ])('does not pause the mailbox for a problem with one email or the connection: %s', (message) => {
    expect(classifyProviderThrottle(message)).toBeNull()
  })
})
