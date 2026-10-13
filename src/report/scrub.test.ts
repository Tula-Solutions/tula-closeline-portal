import { describe, expect, test } from 'bun:test'
import { scrubEvent, stripUrl } from '~/report/scrub'

describe('stripUrl', () => {
  test.each([
    ['https://app.example/sign-up?x=1#invitation=abc', 'https://app.example/sign-up'],
    ['https://app.example/a/b#frag', 'https://app.example/a/b'],
    ['/sign-up?email=a@b.c#invitation=abc', '/sign-up'],
    ['https://user:pw@app.example/x', 'https://app.example/x'],
  ])('%s -> %s', (input, expected) => {
    expect(stripUrl(input)).toBe(expected)
  })
})

describe('scrubEvent drops anything named like a secret, at any depth', () => {
  test.each([
    'token',
    'accessToken',
    'refresh_token',
    'invitationToken',
    'password',
    'newPassword',
    'code',
    'verificationCode',
    'email',
    'userEmail',
    'identifier',
    'Authorization',
    'authorization',
    'cookie',
    'secret',
    'attemptSecret',
    'x-tula-attempt',
    'session',
  ])('key %s', (key) => {
    const event = {
      message: 'boom',
      tags: { [key]: 'value-that-must-not-leave' },
      contexts: { form: { [key]: 'value-that-must-not-leave', deep: [{ [key]: 'x' }] } },
      [key]: 'value-that-must-not-leave',
    }
    const clean = scrubEvent(event)
    expect(JSON.stringify(clean)).not.toContain('value-that-must-not-leave')
    expect(JSON.stringify(clean)).not.toContain(`"${key}"`)
    expect(clean.message).toBe('boom')
  })

  test('keeps what a report needs', () => {
    const clean = scrubEvent({
      level: 'error',
      release: 'v1',
      exception: { values: [{ type: 'ApiError', value: 'API 503 server.unavailable' }] },
    })
    expect(clean.exception.values[0]?.value).toBe('API 503 server.unavailable')
    expect(clean.release).toBe('v1')
  })

  test('removes the user, breadcrumbs, extra data, cookies, headers and request body', () => {
    const clean = scrubEvent({
      user: { id: '1', ip_address: '1.2.3.4' },
      breadcrumbs: [{ category: 'fetch', data: { url: 'https://auth/x' } }],
      extra: { form: { name: 'Maya' } },
      request: {
        url: 'https://app.example/sign-up?token=a#invitation=b',
        headers: { 'User-Agent': 'x' },
        cookies: { a: 'b' },
        data: { password: 'p' },
        query_string: 'token=a',
      },
    }) as Record<string, unknown>
    expect(clean.user).toBeUndefined()
    expect(clean.breadcrumbs).toBeUndefined()
    expect(clean.extra).toBeUndefined()
    expect(clean.request).toEqual({ url: 'https://app.example/sign-up' })
  })

  test('strips the query and fragment from a transaction name that is a URL', () => {
    expect(scrubEvent({ transaction: '/sign-up?x=1#invitation=abc' }).transaction).toBe('/sign-up')
  })

  test('does not change the event it was given', () => {
    const event = { tags: { email: 'a@b.c' }, user: { id: '1' } }
    scrubEvent(event)
    expect(event.tags.email).toBe('a@b.c')
    expect(event.user.id).toBe('1')
  })
})
