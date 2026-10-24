import { ANALYTICS_ERRORS, ERRORS, MAX_ANALYTICS_RANGE_MONTHS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of an analytics call into plain words, branching on the contract's code and never
 * on the status. No message carries text from the service.
 */
export function presentAnalytics(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ANALYTICS_ERRORS['analytics.range_too_large'].code:
        return {
          message: `That date range is longer than ${MAX_ANALYTICS_RANGE_MONTHS} months. Choose a shorter one.`,
        }
      case ERRORS['request.not_found'].code:
        return {
          message: 'That Rep is not one of the people your numbers cover. Choose another.',
        }
      case ERRORS['request.invalid'].code:
        return {
          message:
            'Those filters could not be used together. Clear a filter or choose another range and try again.',
        }
      case ERRORS['auth.forbidden'].code:
        return {
          message:
            'Your role cannot break the numbers down that way. Use the Overview or Reps view.',
        }
      default:
        break
    }
  }
  return presentManage(error)
}
