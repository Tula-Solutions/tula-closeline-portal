import { BOOKING_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of a calendar or working-hours call into plain words, branching on the contract's
 * code and never on the status. The four calendar codes use the contract's own text; every other
 * code uses the words of the members screens. No message carries text from the service.
 */
export function presentCalendar(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case BOOKING_ERRORS['calendar.authorization_failed'].code:
        return { message: BOOKING_ERRORS['calendar.authorization_failed'].message }
      case BOOKING_ERRORS['calendar.hours_invalid'].code:
        return {
          message: `${BOOKING_ERRORS['calendar.hours_invalid'].message} Use a real time zone, and give each window an end after its start with none overlapping.`,
        }
      case BOOKING_ERRORS['booking.calendar_unavailable'].code:
        return { message: BOOKING_ERRORS['booking.calendar_unavailable'].message }
      case BOOKING_ERRORS['calendar.not_connected'].code:
        return { message: BOOKING_ERRORS['calendar.not_connected'].message }
      case ERRORS['request.invalid'].code:
        return { message: 'Check the details you entered and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
