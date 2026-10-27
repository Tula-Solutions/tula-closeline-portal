import { CONSENT_ERRORS, ERRORS, PROSPECT_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of a Contact Consent or Suppression call into plain words, branching on the
 * contract's code and never on the status. Every other code uses the words of the members screens.
 * No message carries text from the service.
 */
export function presentConsent(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case PROSPECT_ERRORS['prospect.not_found'].code:
        return { message: 'That Prospect no longer exists, or you cannot see it. Reload the page.' }
      case CONSENT_ERRORS['consent.not_found'].code:
        return {
          message: 'That Consent Wording or Suppression entry no longer exists. Reload the page.',
        }
      case CONSENT_ERRORS['consent.wording_locked'].code:
        return {
          message:
            'A Prospect has already agreed to this wording, or a form uses it, so it cannot change. Write a new version instead.',
        }
      case CONSENT_ERRORS['consent.entry_not_removable'].code:
        return {
          message:
            'Only an entry added by hand can be removed. Entries made by a Prospect or by a bounce stay.',
        }
      case ERRORS['request.invalid'].code:
        return { message: 'Check the details you entered and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
