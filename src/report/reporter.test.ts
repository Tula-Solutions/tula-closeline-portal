import { afterEach, describe, expect, test } from 'bun:test'
import * as Sentry from '@sentry/browser'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import {
  createReporter,
  noopReporter,
  sentryOptions,
  shouldReport,
  startReporting,
} from '~/report/reporter'
import { TEST_ENV } from '~/testing/fixtures'

describe('shouldReport', () => {
  test.each([
    [400, 'request.invalid', false],
    [401, 'auth.invalid_credentials', false],
    [401, 'auth.token_expired', false],
    [403, 'auth.forbidden', false],
    [404, 'flow.not_found', false],
    [409, 'flow.invalid_step', false],
    [422, 'verification.invalid_code', false],
    [429, 'rate.limited', false],
    [0, CLIENT_ERRORS.network, false],
    [0, CLIENT_ERRORS.timeout, false],
    [500, 'server.internal', true],
    [503, 'server.unavailable', true],
    [503, 'membership.unavailable', true],
    [200, CLIENT_ERRORS.badResponse, true],
  ])('API %d %s reports: %p', (status, code, expected) => {
    expect(shouldReport(new ApiError({ code, status }))).toBe(expected)
  })

  test('an error from our own code is reported; a cancelled request is not', () => {
    expect(shouldReport(new TypeError('x is undefined'))).toBe(true)
    expect(shouldReport(new DOMException('cancelled', 'AbortError'))).toBe(false)
  })
})

describe('createReporter', () => {
  test('reports a 5xx as its status and code only, with no server text', () => {
    const captured: Error[] = []
    createReporter((error) => captured.push(error)).report(
      new ApiError({ code: 'server.internal', status: 500 })
    )
    expect(captured).toHaveLength(1)
    expect(captured[0]?.message).toBe('API 500 server.internal')
    expect(captured[0]?.name).toBe('ApiError')
  })

  test('drops expected failures', () => {
    const captured: Error[] = []
    const reporter = createReporter((error) => captured.push(error))
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      reporter.report(new ApiError({ code: 'request.invalid', status }))
    }
    expect(captured).toEqual([])
  })

  test('wraps a thrown value that is not an Error', () => {
    const captured: Error[] = []
    createReporter((error) => captured.push(error)).report('just a string with user@example.com')
    expect(captured).toHaveLength(1)
    expect(captured[0]?.message).not.toContain('user@example.com')
  })

  test('the no-op reporter reports nothing', () => {
    expect(noopReporter.report(new Error('x'))).toBeUndefined()
  })
})

describe('Sentry setup', () => {
  const dsn = 'https://abc123@o1.ingest.sentry.io/42'
  const env = { ...TEST_ENV, environment: 'prod' as const, sentryDsn: dsn, release: 'v1' }

  afterEach(async () => {
    await Sentry.close()
  })

  test('is off entirely without a DSN', () => {
    const reporter = startReporting({ ...TEST_ENV, sentryDsn: undefined })
    expect(reporter).toBe(noopReporter)
    expect(Sentry.getClient()).toBeUndefined()
  })

  test('collects no user, cookie, header, body or query data and keeps no breadcrumbs', () => {
    const options = sentryOptions(env, dsn)
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    })
    expect(options.maxBreadcrumbs).toBe(0)
    expect(options.beforeBreadcrumb?.({ message: 'x' }, undefined)).toBeNull()
    expect(options.tracesSampleRate).toBeUndefined()
    expect(options.replaysSessionSampleRate).toBeUndefined()
    const names = (options.defaultIntegrations as { name: string }[]).map(({ name }) => name)
    for (const banned of ['Breadcrumbs', 'Console', 'HttpContext', 'BrowserSession', 'Replay']) {
      expect(names).not.toContain(banned)
    }
  })

  test('what leaves the browser is scrubbed, and an expected error does not leave at all', async () => {
    const sent: string[] = []
    Sentry.init({
      ...sentryOptions(env, dsn),
      transport: () => ({
        send: async (envelope) => {
          sent.push(JSON.stringify(envelope))
          return {}
        },
        flush: async () => true,
      }),
    })
    window.history.replaceState(
      null,
      '',
      '/sign-up?email=maya@example.com#invitation=SECRETTOKEN123456789'
    )
    Sentry.captureException(new Error('boom'), {
      tags: { email: 'maya@example.com', area: 'sign-up' },
      extra: { password: 'hunter2hunter2' },
      user: { email: 'maya@example.com' },
    })
    Sentry.captureException(new ApiError({ code: 'rate.limited', status: 429 }))
    await Sentry.flush(2000)
    const payload = sent.join('\n')
    expect(payload).toContain('boom')
    expect(payload).toContain('sign-up')
    for (const secret of ['maya@example.com', 'hunter2hunter2', 'SECRETTOKEN', 'invitation']) {
      expect(payload).not.toContain(secret)
    }
    expect(sent.filter((item) => item.includes('rate.limited'))).toEqual([])
  })
})
