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

/** Words for a failed form call: a form that already moved on is a conflict; every other code uses the consent words. */
export function presentConsentForm(error: unknown): ShownFailure {
  if (error instanceof ApiError && error.code === ERRORS['request.conflict'].code) {
    return { message: 'That form has already changed state. Reload the page to see where it is.' }
  }
  return presentConsent(error)
}

/** What went wrong on the hosted consent page, in the few kinds the page acts on. */
export type HostedConsentFailure = {
  readonly kind: 'gone' | 'busy' | 'invalid' | 'other'
  readonly message: string
}

/** Words for a failed call on the hosted consent page, by the contract's code and never the status. */
export function presentHostedConsent(error: unknown): HostedConsentFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case CONSENT_ERRORS['consent.invalid_token'].code:
        return { kind: 'gone', message: 'This link does not work.' }
      case ERRORS['rate.limited'].code:
        return { kind: 'busy', message: 'Too many tries just now. Wait a minute, then try again.' }
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
      case ERRORS['request.too_large'].code:
        return { kind: 'invalid', message: 'Check what you entered and try again.' }
      default:
        break
    }
  }
  return {
    kind: 'other',
    message:
      'We could not reach the service. Nothing was saved. Check your connection and try again.',
  }
}
