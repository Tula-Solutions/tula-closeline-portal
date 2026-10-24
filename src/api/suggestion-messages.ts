import { SUGGESTION_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/** Whether a failure says the Suggestion was decided already, so the screen should refresh instead of retrying. */
export function alreadyDecided(error: unknown): boolean {
  return (
    error instanceof ApiError && error.code === SUGGESTION_ERRORS['suggestion.not_pending'].code
  )
}

/**
 * Turns a failure of a Suggestion call into plain words, branching on the code. Codes this table
 * does not own (sign-in, role, server) fall back to the words for members and Teams.
 */
export function presentSuggestion(error: unknown): ShownFailure {
  if (alreadyDecided(error)) {
    return { message: 'This Suggestion was already decided by someone else.' }
  }
  if (error instanceof ApiError && error.code === SUGGESTION_ERRORS['suggestion.not_found'].code) {
    return { message: 'That Suggestion no longer exists. Reload the list.' }
  }
  return presentManage(error)
}
