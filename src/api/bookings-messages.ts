import { BOOKING_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of a Booking call (list, cancel, reschedule, free times) into plain words,
 * branching on the contract's code and never on the status. No message carries text from the service.
 */
export function presentBooking(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case BOOKING_ERRORS['booking.slot_taken'].code:
        return { message: 'That time was just taken. Pick another time.' }
      case BOOKING_ERRORS['booking.slot_invalid'].code:
        return { message: 'That time can no longer be booked. Pick another time.' }
      case BOOKING_ERRORS['booking.calendar_unavailable'].code:
        return {
          message:
            "The Rep's calendar did not answer, so nothing was changed. Try again in a moment.",
        }
      case BOOKING_ERRORS['booking.not_active'].code:
        return { message: 'This Booking was cancelled, so it cannot be moved.' }
      case BOOKING_ERRORS['booking.not_found'].code:
        return { message: 'This Booking no longer exists, or it is not yours to see.' }
      case BOOKING_ERRORS['booking.type_not_found'].code:
        return { message: 'This Booking Type is retired, so there are no new times to offer.' }
      case BOOKING_ERRORS['booking.no_eligible_rep'].code:
        return { message: 'No Rep has a free time for this Prospect right now.' }
      case ERRORS['request.invalid'].code:
        return { message: 'Check the details and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
