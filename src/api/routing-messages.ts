import { BOOKING_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of a Routing Rule call into plain words, branching on the contract's code and
 * never on the status. Every other code uses the words of the members screens. No message carries
 * text from the service.
 */
export function presentRouting(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case BOOKING_ERRORS['routing.rule_invalid'].code:
        return {
          message:
            'Core did not accept that rule. Name it, give it a target, and pick at least two different Reps for a pool. Only the default rule has no conditions, and there is one, tried last.',
        }
      case BOOKING_ERRORS['routing.rule_not_found'].code:
        return {
          message:
            'That rule is gone, or it is not yours to change. A Manager can change only rules that send to their own Team or its Reps. Reload the list.',
        }
      case BOOKING_ERRORS['booking.type_not_found'].code:
        return { message: 'A Booking Type named there no longer exists. Choose again.' }
      case ERRORS['request.invalid'].code:
        return { message: 'Check the details you entered and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
