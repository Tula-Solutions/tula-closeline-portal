import { describe, expect, test } from 'bun:test'
import { AUTH_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { type FieldName, GENERIC_MESSAGE, HANDLED_CODES, present, waitPhrase } from '~/api/messages'

describe('present', () => {
  test.each(HANDLED_CODES)('%s has words of its own, in both flows', (code) => {
    for (const flow of ['sign-up', 'sign-in'] as const) {
      const shown = present(new ApiError({ code, status: 400 }), flow)
      expect(shown.message).not.toBe(GENERIC_MESSAGE)
      expect(shown.message.length).toBeGreaterThan(10)
    }
  })

  test('words never use a term the glossary rules out for these people and things', () => {
    const banned = /\b(user|workspace|tenant|company|customer|account|invite link|signup link)\b/i
    for (const code of HANDLED_CODES) {
      expect(present(new ApiError({ code, status: 400 }), 'sign-in').message).not.toMatch(banned)
      expect(present(new ApiError({ code, status: 400 }), 'sign-up').message).not.toMatch(banned)
    }
  })

  test.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'the server-supplied code %s gets the generic words and does not throw',
    (code) => {
      expect(present(new ApiError({ code, status: 400 }), 'sign-in')).toEqual({
        message: GENERIC_MESSAGE,
      })
    }
  )

  test('an error that is not an ApiError gets the generic words', () => {
    expect(present(new TypeError('x'), 'sign-in').message).toBe(GENERIC_MESSAGE)
  })

  test.each<[string, FieldName]>([
    [AUTH_ERRORS['email.invalid'].code, 'email'],
    [AUTH_ERRORS['password.breached'].code, 'password'],
    [AUTH_ERRORS['signup.organization_name_invalid'].code, 'organizationName'],
    [AUTH_ERRORS['verification.invalid_code'].code, 'code'],
  ])('%s belongs to the %s field', (code, field) => {
    expect(present(new ApiError({ code, status: 422 }), 'sign-up').field).toBe(field)
  })

  test('the choice of words follows the code, not the status', () => {
    const a = present(
      new ApiError({ code: AUTH_ERRORS['flow.not_found'].code, status: 200 }),
      'sign-up'
    )
    const b = present(
      new ApiError({ code: AUTH_ERRORS['flow.not_found'].code, status: 500 }),
      'sign-up'
    )
    expect(a).toEqual(b)
    expect(a.restart).toBe(true)
  })
})

describe('waitPhrase', () => {
  test.each([
    [1, '1 second'],
    [45, '45 seconds'],
    [60, '1 minute'],
    [61, '2 minutes'],
    [3600, '60 minutes'],
  ])('%d seconds is "%s"', (seconds, words) => {
    expect(waitPhrase(seconds)).toBe(words)
  })
})
