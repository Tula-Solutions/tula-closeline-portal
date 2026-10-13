import { ApiError, CLIENT_ERRORS } from '~/api/errors'

/** The form fields an error can belong to. */
export type FieldName = 'email' | 'password' | 'organizationName' | 'code'

/** What to show for a failure: the words, the field they belong to (if any), and whether the flow must restart. */
export type Presented = {
  readonly message: string
  readonly field?: FieldName
  /** The attempt is gone; the person has to begin again. */
  readonly restart?: boolean
  /** The Invitation was refused; offer to create an Organization instead. */
  readonly invitationRefused?: boolean
}

/** Which flow the failure came from; a few messages differ. */
export type FlowKind = 'sign-up' | 'sign-in'

/** Every `area.reason` code the sign-up and sign-in routes can return, each with its own message. */
export const HANDLED_CODES = [
  'request.invalid',
  'email.invalid',
  'password.too_short',
  'password.too_long',
  'password.contains_user_info',
  'password.common',
  'password.breached',
  'signup.organization_name_invalid',
  'signup.invitation_invalid',
  'verification.invalid_code',
  'verification.expired',
  'verification.too_many_attempts',
  'flow.not_found',
  'flow.invalid_step',
  'auth.invalid_credentials',
  'auth.user_banned',
  'auth.no_organization',
  'rate.limited',
  'server.internal',
  'server.unavailable',
  'server.timeout',
  'membership.unavailable',
  'mail.unavailable',
  CLIENT_ERRORS.timeout,
  CLIENT_ERRORS.network,
  CLIENT_ERRORS.badResponse,
] as const

/** The words for a wait: "30 seconds", "1 minute", "5 minutes". */
export function waitPhrase(seconds: number): string {
  if (seconds < 60) {
    return seconds === 1 ? '1 second' : `${seconds} seconds`
  }
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

function tryAgain(seconds: number | undefined): string {
  return seconds === undefined ? 'Try again shortly.' : `Try again in ${waitPhrase(seconds)}.`
}

/** The fallback for a code this table does not know. */
export const GENERIC_MESSAGE = 'Something went wrong. Try again.'

/** Turns a failure into plain-English words for the screen; branches on the code, never the status. */
export function present(error: unknown, flow: FlowKind): Presented {
  if (!(error instanceof ApiError)) {
    return { message: GENERIC_MESSAGE }
  }
  const wait = error.retryAfterSeconds
  const ended = flow === 'sign-up' ? 'This sign-up has ended.' : 'This sign-in has ended.'
  switch (error.code) {
    case 'request.invalid':
      return { message: 'Check the details you entered and try again.' }
    case 'email.invalid':
      return { field: 'email', message: 'Enter a valid email address.' }
    case 'password.too_short':
      return { field: 'password', message: 'The password is too short.' }
    case 'password.too_long':
      return { field: 'password', message: 'The password is too long.' }
    case 'password.contains_user_info':
      return {
        field: 'password',
        message: 'The password contains your name or email address. Choose a different one.',
      }
    case 'password.common':
      return { field: 'password', message: 'That password is too common. Choose a different one.' }
    case 'password.breached':
      return {
        field: 'password',
        message: 'That password has appeared in a data breach. Choose a different one.',
      }
    case 'signup.organization_name_invalid':
      return { field: 'organizationName', message: 'Enter a valid Organization name.' }
    case 'signup.invitation_invalid':
      return {
        invitationRefused: true,
        message:
          'This Invitation is not valid. It may have expired, been used already or been withdrawn. Ask an Admin to send a new one.',
      }
    case 'verification.invalid_code':
      return { field: 'code', message: 'That code is not right. Check it and try again.' }
    case 'verification.expired':
      return { message: 'That code has expired. Send a new code.' }
    case 'verification.too_many_attempts':
      return { message: 'Too many wrong codes. Send a new code.' }
    case 'flow.not_found':
      return { restart: true, message: `${ended} Start again.` }
    case 'flow.invalid_step':
      return { restart: true, message: 'That step is not available now. Start again.' }
    case 'auth.invalid_credentials':
      return { message: 'The email address or password is not right.' }
    case 'auth.user_banned':
      return {
        message: 'This sign-in is blocked. Ask an Owner or Admin of your Organization for help.',
      }
    case 'auth.no_organization':
      return {
        message:
          'You do not belong to an Organization, so you cannot sign in. Ask an Admin for an Invitation.',
      }
    case 'rate.limited':
      return { message: `Too many tries. ${tryAgain(wait)}` }
    case 'server.internal':
      return { message: 'Something went wrong on our side. Try again.' }
    case 'server.unavailable':
      return { message: `Closeline is busy right now. ${tryAgain(wait)}` }
    case 'server.timeout':
      return { message: 'That took too long. Try again.' }
    case 'membership.unavailable':
      return {
        message: `We could not set up your place in the Organization right now. ${
          flow === 'sign-up' ? 'Your code still works. ' : ''
        }${tryAgain(wait)}`,
      }
    case 'mail.unavailable':
      return { message: `We could not send the email right now. ${tryAgain(wait)}` }
    case CLIENT_ERRORS.timeout:
      return {
        message: 'Closeline did not answer in time. Check your connection and try again.',
      }
    case CLIENT_ERRORS.network:
      return { message: 'Could not reach Closeline. Check your connection and try again.' }
    case CLIENT_ERRORS.badResponse:
      return { message: 'Closeline sent an answer we could not read. Try again.' }
    default:
      return { message: GENERIC_MESSAGE }
  }
}
