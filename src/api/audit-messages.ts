import { AUDIT_ERRORS, EXPORT_ERRORS, MAX_AUDIT_RANGE_DAYS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of an audit log call into plain words, branching on the contract's code and never
 * on the status. No message carries text from the service.
 */
export function presentAudit(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case AUDIT_ERRORS['audit.range_too_large'].code:
        return {
          message: `That date range is longer than ${MAX_AUDIT_RANGE_DAYS} days. Choose a shorter one.`,
        }
      case AUDIT_ERRORS['audit.event_not_found'].code:
        return { message: 'That event no longer exists. Reload the list.' }
      default:
        break
    }
  }
  return presentManage(error)
}

/**
 * Turns a failure of an export call into plain words, branching on the contract's code and never
 * on the status. No message carries text from the service.
 */
export function presentExport(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case EXPORT_ERRORS['export.already_running'].code:
        return { message: 'An export is already running. Wait for it to finish, then ask again.' }
      case EXPORT_ERRORS['export.daily_limit'].code:
        return {
          message: 'You can ask for two exports in 24 hours, and both are used. Try again later.',
        }
      case EXPORT_ERRORS['export.expired'].code:
        return { message: 'That export has expired. Ask for a new one.' }
      case EXPORT_ERRORS['export.not_ready'].code:
        return { message: 'That export is not ready yet. Try again when it is.' }
      case EXPORT_ERRORS['export.not_found'].code:
        return { message: 'That export no longer exists. Reload the list.' }
      default:
        break
    }
  }
  return presentManage(error)
}
