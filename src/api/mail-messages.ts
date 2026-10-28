import {
  type DomainCheckStatus,
  ERRORS,
  MAIL_ERRORS,
  type MailboxStateReason,
  type SendRefusalReason,
} from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of a Mailbox call into plain words, branching on the contract's code and never
 * on the status. Every other code uses the words of the members screens. No message carries text
 * from the service.
 */
export function presentMail(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case MAIL_ERRORS['mailbox.not_found'].code:
        return { message: 'That Mailbox no longer exists. Reload the page.' }
      case MAIL_ERRORS['mailbox.not_connected'].code:
        return { message: 'That Mailbox is not connected. Connect it again first.' }
      case MAIL_ERRORS['mailbox.auth_revoked'].code:
        return {
          message: 'The email provider no longer allows access. Connect the Mailbox again.',
        }
      case MAIL_ERRORS['mailbox.already_connected'].code:
        return { message: 'That address is already a connected Mailbox.' }
      case MAIL_ERRORS['mailbox.limit_above_ceiling'].code:
        return {
          message:
            'A limit is higher than your Organization allows. Lower it to the ceiling shown.',
        }
      case MAIL_ERRORS['mailbox.oauth_state_invalid'].code:
        return { message: 'This connection attempt has expired or was already used. Start again.' }
      case ERRORS['rate.limited'].code:
        return { message: 'That was checked a moment ago. Wait a little and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}

/** Why a Mailbox is paused, limited or disconnected, and what to do about it. */
export const STATE_REASON: Record<
  MailboxStateReason,
  { readonly why: string; readonly todo: string; readonly needsAdmin: boolean }
> = {
  owner_paused: {
    why: 'Its owner paused it.',
    todo: 'Resume it when you want it to send again.',
    needsAdmin: false,
  },
  admin_paused: {
    why: 'An Admin paused it.',
    todo: 'Ask an Owner or Admin to resume it.',
    needsAdmin: true,
  },
  complaint_spike: {
    why: 'Too many recipients marked its mail as spam, so Closeline paused it.',
    todo: 'Check the wording and audience of recent sends. An Owner or Admin resumes it once that is fixed.',
    needsAdmin: true,
  },
  bounce_spike: {
    why: 'Too many of its messages bounced, so Closeline paused it.',
    todo: 'Check that Prospect addresses are verified. An Owner or Admin resumes it once that is fixed.',
    needsAdmin: true,
  },
  provider_suspended: {
    why: 'The email provider suspended this account.',
    todo: 'Sort it out with the provider, then connect the Mailbox again.',
    needsAdmin: true,
  },
  auth_revoked: {
    why: 'The email provider no longer allows access.',
    todo: 'Connect the Mailbox again.',
    needsAdmin: false,
  },
  disconnected_by_owner: {
    why: 'It was disconnected.',
    todo: 'Connect it again to send from it.',
    needsAdmin: false,
  },
  health_warning: {
    why: 'Its health score fell below the warning line, so its limits are halved.',
    todo: 'It recovers as bounces and complaints age out of the health window. Keep sends to verified addresses.',
    needsAdmin: false,
  },
}

/** What each reason a send was refused or deferred means, in plain words. */
export const SEND_REASON: Record<SendRefusalReason, string> = {
  campaign_not_running: 'The Campaign was not running.',
  outside_window: 'It was outside the sending hours. It is tried again when they open.',
  unverified_address: 'The address has not been verified.',
  suppressed: 'The address is on the Suppression list.',
  no_consent: 'There is no Contact Consent to email this Prospect.',
  mailbox_unavailable: 'No Mailbox was able to send it.',
  limit_reached: 'The Mailbox hit its limit. It is tried again later.',
  organization_cap_reached: "The Organization's daily cap was used up. It is tried again later.",
  duplicate: 'It was already sent or is being sent.',
}

/** What each domain check status means. */
export const DOMAIN_STATUS: Record<DomainCheckStatus, string> = {
  pass: 'Pass',
  weak: 'Weak',
  fail: 'Fail',
  missing: 'Missing',
  unknown: 'Could not check',
}
