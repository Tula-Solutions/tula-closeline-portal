import { AUTH_ERRORS, ERRORS } from 'tula-closeline-contract'
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
  ERRORS['request.invalid'].code,
  AUTH_ERRORS['email.invalid'].code,
  AUTH_ERRORS['password.too_short'].code,
  AUTH_ERRORS['password.too_long'].code,
  AUTH_ERRORS['password.contains_user_info'].code,
  AUTH_ERRORS['password.common'].code,
  AUTH_ERRORS['password.breached'].code,
  AUTH_ERRORS['signup.organization_name_invalid'].code,
  AUTH_ERRORS['signup.invitation_invalid'].code,
  AUTH_ERRORS['verification.invalid_code'].code,
  AUTH_ERRORS['verification.expired'].code,
  AUTH_ERRORS['verification.too_many_attempts'].code,
  AUTH_ERRORS['flow.not_found'].code,
  AUTH_ERRORS['flow.invalid_step'].code,
  AUTH_ERRORS['auth.invalid_credentials'].code,
  AUTH_ERRORS['auth.user_banned'].code,
  AUTH_ERRORS['auth.no_organization'].code,
  ERRORS['rate.limited'].code,
  ERRORS['server.internal'].code,
  ERRORS['server.unavailable'].code,
  ERRORS['server.timeout'].code,
  AUTH_ERRORS['membership.unavailable'].code,
  AUTH_ERRORS['mail.unavailable'].code,
  CLIENT_ERRORS.timeout,
  CLIENT_ERRORS.network,
  CLIENT_ERRORS.badResponse,
] as const

/** A code the portal has words for. */
export type HandledCode = (typeof HANDLED_CODES)[number]

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

type Context = {
  readonly wait: number | undefined
  readonly flow: FlowKind
  readonly ended: string
}

/**
 * The words for each handled code. Keyed by the contract's codes, so a code the contract does not
 * have is a type error, and `HANDLED_CODES` and this table must name the same codes.
 */
const RULES: { readonly [C in HandledCode]: (context: Context) => Presented } = {
  [ERRORS['request.invalid'].code]: () => ({
    message: 'Check the details you entered and try again.',
  }),
  [AUTH_ERRORS['email.invalid'].code]: () => ({
    field: 'email',
    message: 'Enter a valid email address.',
  }),
  [AUTH_ERRORS['password.too_short'].code]: () => ({
    field: 'password',
    message: 'The password is too short.',
  }),
  [AUTH_ERRORS['password.too_long'].code]: () => ({
    field: 'password',
    message: 'The password is too long.',
  }),
  [AUTH_ERRORS['password.contains_user_info'].code]: () => ({
    field: 'password',
    message: 'The password contains your name or email address. Choose a different one.',
  }),
  [AUTH_ERRORS['password.common'].code]: () => ({
    field: 'password',
    message: 'That password is too common. Choose a different one.',
  }),
  [AUTH_ERRORS['password.breached'].code]: () => ({
    field: 'password',
    message: 'That password has appeared in a data breach. Choose a different one.',
  }),
  [AUTH_ERRORS['signup.organization_name_invalid'].code]: () => ({
    field: 'organizationName',
    message: 'Enter a valid Organization name.',
  }),
  [AUTH_ERRORS['signup.invitation_invalid'].code]: () => ({
    invitationRefused: true,
    message:
      'This Invitation is not valid. It may have expired, been used already or been withdrawn. Ask an Admin to send a new one.',
  }),
  [AUTH_ERRORS['verification.invalid_code'].code]: () => ({
    field: 'code',
    message: 'That code is not right. Check it and try again.',
  }),
  [AUTH_ERRORS['verification.expired'].code]: () => ({
    message: 'That code has expired. Send a new code.',
  }),
  [AUTH_ERRORS['verification.too_many_attempts'].code]: () => ({
    message: 'Too many wrong codes. Send a new code.',
  }),
  [AUTH_ERRORS['flow.not_found'].code]: ({ ended }) => ({
    restart: true,
    message: `${ended} Start again.`,
  }),
  [AUTH_ERRORS['flow.invalid_step'].code]: () => ({
    restart: true,
    message: 'That step is not available now. Start again.',
  }),
  [AUTH_ERRORS['auth.invalid_credentials'].code]: () => ({
    message: 'The email address or password is not right.',
  }),
  [AUTH_ERRORS['auth.user_banned'].code]: () => ({
    message: 'This sign-in is blocked. Ask an Owner or Admin of your Organization for help.',
  }),
  [AUTH_ERRORS['auth.no_organization'].code]: () => ({
    message:
      'You do not belong to an Organization, so you cannot sign in. Ask an Admin for an Invitation.',
  }),
  [ERRORS['rate.limited'].code]: ({ wait }) => ({ message: `Too many tries. ${tryAgain(wait)}` }),
  [ERRORS['server.internal'].code]: () => ({
    message: 'Something went wrong on our side. Try again.',
  }),
  [ERRORS['server.unavailable'].code]: ({ wait }) => ({
    message: `Closeline is busy right now. ${tryAgain(wait)}`,
  }),
  [ERRORS['server.timeout'].code]: () => ({ message: 'That took too long. Try again.' }),
  [AUTH_ERRORS['membership.unavailable'].code]: ({ wait, flow }) => ({
    message: `We could not set up your place in the Organization right now. ${
      flow === 'sign-up' ? 'Your code still works. ' : ''
    }${tryAgain(wait)}`,
  }),
  [AUTH_ERRORS['mail.unavailable'].code]: ({ wait }) => ({
    message: `We could not send the email right now. ${tryAgain(wait)}`,
  }),
  [CLIENT_ERRORS.timeout]: () => ({
    message: 'Closeline did not answer in time. Check your connection and try again.',
  }),
  [CLIENT_ERRORS.network]: () => ({
    message: 'Could not reach Closeline. Check your connection and try again.',
  }),
  [CLIENT_ERRORS.badResponse]: () => ({
    message: 'Closeline sent an answer we could not read. Try again.',
  }),
}

/** Turns a failure into plain-English words for the screen; branches on the code, never the status. */
export function present(error: unknown, flow: FlowKind): Presented {
  if (!(error instanceof ApiError) || !Object.hasOwn(RULES, error.code)) {
    return { message: GENERIC_MESSAGE }
  }
  const ended = flow === 'sign-up' ? 'This sign-up has ended.' : 'This sign-in has ended.'
  return RULES[error.code as HandledCode]({ wait: error.retryAfterSeconds, flow, ended })
}
