import { describe, expect, test } from 'bun:test'
import { ApiError, CLIENT_ERRORS, clientError } from '~/api/errors'
import { createKeyHolder } from '~/api/idempotency'

function counting() {
  let n = 0
  return createKeyHolder(() => {
    n += 1
    return `test-key-number-${n}`
  })
}

describe('the idempotency key holder', () => {
  test('the same request asked for twice gets the same key', () => {
    const keys = counting()
    expect(keys.keyFor('a@b.c|rep')).toBe(keys.keyFor('a@b.c|rep'))
  })

  test('a different request gets a different key, so the server never sees one key with two bodies', () => {
    const keys = counting()
    expect(keys.keyFor('a')).not.toBe(keys.keyFor('b'))
  })

  test('after a success the next request gets a new key', () => {
    const keys = counting()
    const first = keys.keyFor('a')
    keys.succeeded()
    expect(keys.keyFor('a')).not.toBe(first)
  })

  test.each([
    ['a timeout', clientError(CLIENT_ERRORS.timeout), true],
    ['no network', clientError(CLIENT_ERRORS.network), true],
    ['an answer it could not read', clientError(CLIENT_ERRORS.badResponse, 201), true],
    ['a 503', new ApiError({ code: 'server.unavailable', status: 503 }), true],
    [
      'the first try still running',
      new ApiError({ code: 'request.idempotency_in_progress', status: 409 }),
      true,
    ],
    ['a validation refusal', new ApiError({ code: 'request.invalid', status: 400 }), false],
    ['a taken name', new ApiError({ code: 'team.name_taken', status: 409 }), false],
    ['a 403', new ApiError({ code: 'auth.forbidden', status: 403 }), false],
  ])('after %s the key is %s', (_name, error, kept) => {
    const keys = counting()
    const first = keys.keyFor('a')
    keys.failed(error)
    expect(keys.keyFor('a') === first).toBe(kept)
  })

  test('the generated key is one the contract accepts', () => {
    expect(createKeyHolder().keyFor('a')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
  })
})
