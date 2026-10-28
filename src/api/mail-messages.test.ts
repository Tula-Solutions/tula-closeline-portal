import { describe, expect, test } from 'bun:test'
import {
  ERRORS,
  MAIL_ERRORS,
  MAILBOX_STATE_REASONS,
  SEND_REFUSAL_REASONS,
} from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentMail, SEND_REASON, STATE_REASON } from '~/api/mail-messages'

describe('presentMail', () => {
  test('branches on the code, not the status', () => {
    const above = new ApiError({
      code: MAIL_ERRORS['mailbox.limit_above_ceiling'].code,
      status: 422,
    })
    const other = new ApiError({ code: ERRORS['auth.forbidden'].code, status: 422 })
    expect(presentMail(above).message).toMatch(/higher than your Organization allows/)
    expect(presentMail(other).message).not.toMatch(/higher than your Organization allows/)
  })

  test('never shows text from the service', () => {
    const error = new ApiError({
      code: MAIL_ERRORS['mailbox.auth_revoked'].code,
      status: 409,
    })
    expect(presentMail(error).message).not.toContain('auth_revoked')
  })
})

describe('reason words', () => {
  test('every Mailbox state reason and send refusal reason has words', () => {
    for (const reason of MAILBOX_STATE_REASONS) {
      expect(STATE_REASON[reason].why.length).toBeGreaterThan(0)
      expect(STATE_REASON[reason].todo.length).toBeGreaterThan(0)
    }
    for (const reason of SEND_REFUSAL_REASONS) {
      expect(SEND_REASON[reason].length).toBeGreaterThan(0)
    }
  })
})
