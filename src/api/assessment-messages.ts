import { ASSESSMENT_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/** Whether the failure is core saying the assessment no longer exists. */
export function assessmentGone(error: unknown): boolean {
  return error instanceof ApiError && error.code === ASSESSMENT_ERRORS['assessment.not_found'].code
}

/**
 * Turns a failure of an assessment call into plain words, branching on the contract's code and
 * never on the status. No message carries text from the service.
 */
export function presentAssessment(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ASSESSMENT_ERRORS['assessment.not_found'].code:
        return { message: 'That assessment is no longer there. Reload the list.' }
      case ERRORS['auth.forbidden'].code:
        return { message: 'Only an Owner or Admin can review assessments.' }
      case ERRORS['request.invalid'].code:
        return {
          message: 'Those filters could not be used together. Clear one and try again.',
        }
      default:
        break
    }
  }
  return presentManage(error)
}

/**
 * Words for a failed read of a Call's transcript, by the contract's code: a Draft or an unknown Call
 * is the same not found, and voice being down is told apart from a slow answer.
 */
export function presentTranscript(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ASSESSMENT_ERRORS['assessment.not_found'].code:
        return { message: 'The transcript for this turn is not available. Reload the list.' }
      case ERRORS['server.unavailable'].code:
        return { message: 'The transcript could not be reached just now. Try again in a moment.' }
      case ERRORS['server.timeout'].code:
        return { message: 'The transcript took too long to load. Try again.' }
      default:
        break
    }
  }
  return presentAssessment(error)
}
