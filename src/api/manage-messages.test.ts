import { describe, expect, test } from 'bun:test'
import { CORE_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { MANAGE_CODES, presentManage } from '~/api/manage-messages'
import { GENERIC_MESSAGE } from '~/api/messages'

describe('presentManage', () => {
  test.each(MANAGE_CODES)('%s has words of its own', (code) => {
    const shown = presentManage(new ApiError({ code, status: 400 }))
    expect(shown.message).not.toBe(GENERIC_MESSAGE)
    expect(shown.message).not.toMatch(
      /\b(user|workspace|tenant|company|customer|account|group|squad)\b/i
    )
  })

  test('rate limiting says how long to wait', () => {
    const shown = presentManage(
      new ApiError({ code: ERRORS['rate.limited'].code, status: 429, retryAfterSeconds: 90 })
    )
    expect(shown.message).toBe('Too many tries. Try again in 2 minutes.')
  })

  test('a pending Invitation belongs to the email field and a taken name to the name field', () => {
    expect(
      presentManage(
        new ApiError({ code: CORE_ERRORS['invitation.already_pending'].code, status: 409 })
      ).field
    ).toBe('email')
    expect(
      presentManage(new ApiError({ code: CORE_ERRORS['team.name_taken'].code, status: 409 })).field
    ).toBe('name')
  })

  test.each(['__proto__', 'constructor', 'toString', 'nothing.known'])(
    'the code %s gets the generic words',
    (code) => {
      expect(presentManage(new ApiError({ code, status: 400 })).message).toBe(GENERIC_MESSAGE)
    }
  )

  test('what is not an ApiError gets the generic words', () => {
    expect(presentManage(new TypeError('x')).message).toBe(GENERIC_MESSAGE)
  })
})
