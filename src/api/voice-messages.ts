import { ERRORS, VOICE_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'
import { waitPhrase } from '~/api/messages'

/**
 * Turns a failure of a Lines call into plain words, branching on the contract's code and never on
 * the status. The Line codes are worded here; the common unavailable code names the phone number service
 * (it is how the number provider or the directory failing closed reaches the page); every other
 * code uses the words of the members screens. No message carries text from the service.
 */
export function presentLine(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case VOICE_ERRORS['line.not_found'].code:
        return { message: 'That Line no longer exists. Reload the list.' }
      case VOICE_ERRORS['line.number_unavailable'].code:
        return {
          message:
            'That number is not available. Try another area code, or a different number to port.',
        }
      case VOICE_ERRORS['line.released'].code:
        return { message: 'That Line has been released and cannot be changed. Reload the list.' }
      case VOICE_ERRORS['line.assignment_invalid'].code:
        return {
          message:
            'That Team or Rep is not in your Organization. Reload the page and choose again.',
        }
      case ERRORS['server.unavailable'].code:
        return {
          message: `The phone number service is not available right now. ${
            error.retryAfterSeconds === undefined
              ? 'Try again shortly.'
              : `Try again in ${waitPhrase(error.retryAfterSeconds)}.`
          }`,
        }
      default:
        break
    }
  }
  return presentManage(error)
}
