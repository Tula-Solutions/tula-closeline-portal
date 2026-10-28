import { COPILOT_ERRORS, ERRORS, VOICE_ERRORS } from 'tula-closeline-contract'
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

/** Turns a failure of placing or answering a Call into plain words, branching on the contract's code. */
export function presentCall(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case VOICE_ERRORS['call.number_invalid'].code:
        return { message: 'That number cannot be called. Check it, with the country code.' }
      case VOICE_ERRORS['call.line_unavailable'].code:
        return {
          message:
            'You have no active Line to call from. Ask an Admin to assign one to you, your Team or your role.',
          link: 'lines',
        }
      case VOICE_ERRORS['call.limit_reached'].code:
        return { message: 'Too many Calls are in progress. Try again in a moment.' }
      case VOICE_ERRORS['call.disclosure_failed'].code:
        return { message: 'The Disclosure could not be played, so the Call did not go ahead.' }
      case VOICE_ERRORS['call.not_ringing'].code:
        return { message: 'Someone else answered, or the Call was missed.' }
      case ERRORS['server.unavailable'].code:
        return { message: 'The phone service is not available right now. Try again shortly.' }
      default:
        break
    }
  }
  return presentManage(error)
}

/** Turns a failure of the Calls history, wrap-up or Recording calls into plain words, branching on the contract's code. */
export function presentCallHistory(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      // Not in the contract's error maps yet, though the call routes answer it.
      case 'call.not_found':
        return { message: 'That Call is not available to you. Go back to the list.' }
      case COPILOT_ERRORS['card.not_found'].code:
        return { message: 'That card is no longer available. Reload the cards.' }
      case VOICE_ERRORS['call.not_ended'].code:
        return { message: 'That Call has not ended yet. Wrap it up once it has.' }
      case VOICE_ERRORS['recording.not_found'].code:
        return { message: 'There is no Recording for this Call.' }
      case VOICE_ERRORS['recording.not_ready'].code:
        return { message: 'The Recording is still being stored. Try again in a minute.' }
      default:
        break
    }
  }
  return presentManage(error)
}
