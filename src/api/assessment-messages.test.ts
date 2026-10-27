import { describe, expect, test } from 'bun:test'
import { ASSESSMENT_ERRORS, ERRORS } from 'tula-closeline-contract'
import { assessmentGone, presentAssessment } from '~/api/assessment-messages'
import { ApiError } from '~/api/errors'

describe('presentAssessment', () => {
  test('branches on the code, not the status', () => {
    const gone = new ApiError({ code: ASSESSMENT_ERRORS['assessment.not_found'].code, status: 404 })
    expect(assessmentGone(gone)).toBe(true)
    expect(presentAssessment(gone).message).toMatch(/no longer there/)
    const sameStatus = new ApiError({ code: ERRORS['auth.forbidden'].code, status: 404 })
    expect(assessmentGone(sameStatus)).toBe(false)
    expect(presentAssessment(sameStatus).message).toMatch(/Owner or Admin/)
  })
})
