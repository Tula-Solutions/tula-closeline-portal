import { BOOKING_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { waitPhrase } from '~/api/messages'

/** What went wrong on the public booking page, in the few kinds the page acts on. */
export type PublicBookingFailure = {
  readonly kind:
    | 'taken'
    | 'gone'
    | 'busy'
    | 'closed'
    | 'no_times'
    | 'calendar'
    | 'invalid'
    | 'other'
  readonly message: string
  /** Seconds to wait before another try, from `Retry-After` (kind `busy`). */
  readonly waitSeconds?: number
}

/**
 * Turns a failure of a public booking call into plain words, branching on the contract's `area.reason`
 * code and never the status. No message carries text from the service.
 */
export function presentPublicBooking(error: unknown): PublicBookingFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case BOOKING_ERRORS['booking.slot_taken'].code:
      case BOOKING_ERRORS['booking.slot_invalid'].code:
        return {
          kind: 'taken',
          message: 'That time was just taken. The times below are up to date; pick another.',
        }
      case BOOKING_ERRORS['booking.not_found'].code:
      case BOOKING_ERRORS['booking.type_not_found'].code:
        return { kind: 'gone', message: 'This booking link no longer works.' }
      case BOOKING_ERRORS['booking.not_active'].code:
        return { kind: 'closed', message: 'This Booking was cancelled.' }
      case BOOKING_ERRORS['booking.already_started'].code:
        return { kind: 'closed', message: 'This Booking has already started.' }
      case BOOKING_ERRORS['booking.no_eligible_rep'].code:
        return { kind: 'no_times', message: 'No times are available right now. Check back later.' }
      case BOOKING_ERRORS['booking.calendar_unavailable'].code:
        return {
          kind: 'calendar',
          message:
            'The calendar is not available right now. Nothing was booked; try again shortly.',
        }
      case ERRORS['rate.limited'].code: {
        const seconds = error.retryAfterSeconds
        return {
          kind: 'busy',
          message:
            seconds === undefined
              ? 'Too many tries. Wait a little, then try again.'
              : `Too many tries. Try again in ${waitPhrase(seconds)}.`,
          ...(seconds === undefined ? {} : { waitSeconds: seconds }),
        }
      }
      case ERRORS['request.idempotency_in_progress'].code:
        return {
          kind: 'busy',
          message: 'Your last request is still being processed. Wait a moment, then try again.',
        }
      case ERRORS['request.idempotency_key_reused'].code:
        return {
          kind: 'other',
          message: 'That request could not be repeated. Reload the page and try again.',
        }
      case ERRORS['request.invalid'].code:
        return { kind: 'invalid', message: 'Check your name and email address and try again.' }
      default:
        break
    }
  }
  return {
    kind: 'other',
    message: 'We could not reach the service. Check your connection and try again.',
  }
}
