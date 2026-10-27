import { describe, expect, test } from 'bun:test'
import { AUTH_ERRORS, ERRORS } from 'tula-closeline-contract'
import {
  ApiError,
  CLIENT_ERRORS,
  isClientFault,
  isTransient,
  isUnauthenticated,
  parseErrorResponse,
} from '~/api/errors'
import { failure, json } from '~/testing/fixtures'

describe('parseErrorResponse', () => {
  test('reads the contract error body into a code and status', async () => {
    const error = await parseErrorResponse(
      failure(422, AUTH_ERRORS['verification.invalid_code'].code)
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(AUTH_ERRORS['verification.invalid_code'].code)
    expect(error.status).toBe(422)
    expect(error.retryAfterSeconds).toBeUndefined()
  })

  test('never carries the server message, so a message cannot leak into a log or report', async () => {
    const error = await parseErrorResponse(
      failure(401, AUTH_ERRORS['auth.invalid_credentials'].code)
    )
    expect(error.message).toBe(AUTH_ERRORS['auth.invalid_credentials'].code)
    expect(JSON.stringify(error)).not.toContain('Text the portal never shows')
  })

  test('takes the retry time from the Retry-After header first', async () => {
    const response = failure(429, 'rate.limited', { retryAfter: 90 }, { 'retry-after': '30' })
    expect((await parseErrorResponse(response)).retryAfterSeconds).toBe(30)
  })

  test('falls back to details.retryAfter, the field the auth service always sets', async () => {
    const response = failure(503, 'server.unavailable', { retryAfter: 7 })
    expect((await parseErrorResponse(response)).retryAfterSeconds).toBe(7)
  })

  test('reads a Retry-After HTTP date', async () => {
    const now = Date.parse('2026-10-13T10:00:00Z')
    const response = failure(429, 'rate.limited', undefined, {
      'retry-after': 'Tue, 13 Oct 2026 10:01:00 GMT',
    })
    expect((await parseErrorResponse(response, now)).retryAfterSeconds).toBe(60)
  })

  test.each([
    ['not json', new Response('<html>bad gateway</html>', { status: 502 })],
    ['json without the error body', json(500, { message: 'boom' })],
    ['an error body with a malformed code', json(400, { error: { code: 'BAD', message: 'x' } })],
    ['an empty body', new Response(null, { status: 500 })],
  ])('%s becomes client.bad_response and keeps the status', async (_name, response) => {
    const error = await parseErrorResponse(response)
    expect(error.code).toBe(CLIENT_ERRORS.badResponse)
    expect(error.status).toBe(response.status)
  })

  test('a huge retry time is capped at an hour', async () => {
    const response = failure(429, 'rate.limited', { retryAfter: 999_999 })
    expect((await parseErrorResponse(response)).retryAfterSeconds).toBe(3600)
  })
})

describe('isTransient', () => {
  test.each([
    [0, CLIENT_ERRORS.timeout, true],
    [0, CLIENT_ERRORS.network, true],
    [502, 'server.internal', true],
    [503, 'booking.calendar_unavailable', true],
    [200, ERRORS['server.unavailable'].code, true],
    [200, ERRORS['auth.unavailable'].code, true],
    [503, 'server.unavailable', true],
    [504, 'server.timeout', true],
    [500, 'server.internal', false],
    [429, 'rate.limited', false],
    [401, ERRORS['auth.token_expired'].code, false],
    [404, AUTH_ERRORS['flow.not_found'].code, false],
    [200, CLIENT_ERRORS.badResponse, false],
    [502, CLIENT_ERRORS.badResponse, true],
  ])('status %d %s -> %p', (status, code, expected) => {
    expect(isTransient(new ApiError({ code, status }))).toBe(expected)
  })

  test('an error that is not an ApiError is not transient', () => {
    expect(isTransient(new Error('x'))).toBe(false)
  })
})

describe('isUnauthenticated and isClientFault branch on the code', () => {
  test.each([
    [ERRORS['auth.unauthenticated'].code, true],
    [ERRORS['auth.token_expired'].code, true],
    [AUTH_ERRORS['session.reuse_detected'].code, true],
    [ERRORS['auth.forbidden'].code, false],
    [ERRORS['rate.limited'].code, false],
  ])('%s unauthenticated -> %p whatever the status', (code, expected) => {
    expect(isUnauthenticated(new ApiError({ code, status: 400 }))).toBe(expected)
  })

  test.each([
    [ERRORS['auth.forbidden'].code, 200, true],
    [ERRORS['request.invalid'].code, 200, true],
    [ERRORS['auth.unauthenticated'].code, 401, false],
    [ERRORS['rate.limited'].code, 429, false],
    [ERRORS['server.unavailable'].code, 403, false],
    [AUTH_ERRORS['auth.invalid_credentials'].code, 401, false],
    ['some.unlisted_code', 403, true],
    [CLIENT_ERRORS.badResponse, 403, true],
    [CLIENT_ERRORS.badResponse, 502, false],
    [CLIENT_ERRORS.network, 0, false],
  ])('%s at %d is a client fault -> %p', (code, status, expected) => {
    expect(isClientFault(new ApiError({ code, status }))).toBe(expected)
  })
})
