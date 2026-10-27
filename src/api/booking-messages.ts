import { BOOKING_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of a Booking Type call into plain words, branching on the contract's code and
 * never on the status. Every other code uses the words of the members screens. No message carries
 * text from the service.
 */
export function presentBookingType(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case BOOKING_ERRORS['booking.type_invalid'].code:
        return {
          message:
            'Core did not accept those numbers. Keep the length between 5 and 480 minutes, each buffer to 120 or fewer, and the notice to 30 days or fewer.',
        }
      case BOOKING_ERRORS['booking.type_not_found'].code:
        return { message: 'That Booking Type no longer exists. Reload the list.' }
      case ERRORS['request.invalid'].code:
        return { message: 'Check the details you entered and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
