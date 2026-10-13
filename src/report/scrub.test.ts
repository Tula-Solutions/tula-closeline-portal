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

  test('strips the query and fragment from stack-frame filenames and absolute paths', () => {
    const clean = scrubEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: 'https://x/sign-up#invitation=abc',
                  abs_path: 'https://x/assets/index.js?token=zzz#frag',
                  function: 'boot',
                },
                { filename: 'app:///index.js', abs_path: 'app:///index.js' },
              ],
            },
          },
        ],
      },
    })
    const frames = clean.exception.values[0]?.stacktrace.frames
    expect(frames?.[0]).toEqual({
      filename: 'https://x/sign-up',
      abs_path: 'https://x/assets/index.js',
      function: 'boot',
    })
    expect(frames?.[1]).toEqual({ filename: 'app:///index.js', abs_path: 'app:///index.js' })
  })

  test('redacts a long token-shaped substring in any string, at any depth', () => {
    const token = 'Abc123_-'.repeat(5)
    const clean = scrubEvent({
      message: `Non-Error promise rejection captured with value: ${token}`,
      exception: { values: [{ value: `bad ${token} here`, nested: [{ deep: [token] }] }] },
      tags: { note: token },
    })
    expect(JSON.stringify(clean)).not.toContain(token)
    expect(clean.message).toContain('Non-Error promise rejection captured with value:')
  })

  test('redacts the query and fragment of a URL inside a message, and any credentials', () => {
    const clean = scrubEvent({
      message: 'Failed at https://u:pw@app.example/sign-up?x=1#invitation=abc and went on',
      exception: { values: [{ value: 'see http://localhost:5173/a/b#invitation=zz.' }] },
    })
    expect(clean.message).toBe('Failed at https://app.example/sign-up and went on')
    expect(clean.exception.values[0]?.value).toBe('see http://localhost:5173/a/b')
    expect(JSON.stringify(clean)).not.toMatch(/invitation|pw@|x=1/)
  })

  test('leaves short identifiers, ordinary words and 31-character strings alone', () => {
    const thirtyOne = 'a'.repeat(31)
    const message = `TypeError: Cannot read properties of undefined (reading 'organization') in HomeScreen ${thirtyOne} sign-up/step-2 v1.2.3`
    const clean = scrubEvent({
      message,
      exception: { values: [{ value: 'API 503 server.unavailable' }] },
    })
    expect(clean.message).toBe(message)
    expect(clean.exception.values[0]?.value).toBe('API 503 server.unavailable')
  })

  test('keeps the identifiers an event needs to be delivered: event id, release, trace ids', () => {
    const hex = 'f'.repeat(32)
    const release = 'a'.repeat(40)
    const clean = scrubEvent({
      event_id: hex,
      release,
      contexts: { trace: { trace_id: hex, span_id: 'b'.repeat(16) } },
      debug_meta: { images: [{ debug_id: '12345678-1234-1234-1234-123456789abc' }] },
    })
    expect(clean.event_id).toBe(hex)
    expect(clean.release).toBe(release)
    expect(clean.contexts.trace.trace_id).toBe(hex)
    expect(clean.debug_meta.images[0]?.debug_id).toBe('12345678-1234-1234-1234-123456789abc')
  })
})
