import { CORE_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import { GENERIC_MESSAGE, waitPhrase } from '~/api/messages'

/** What to show for a failure of a members, Invitations or Teams call, and the field it belongs to. */
export type ShownFailure = { readonly message: string; readonly field?: 'email' | 'name' }

function tryAgain(seconds: number | undefined): string {
  return seconds === undefined ? 'Try again shortly.' : `Try again in ${waitPhrase(seconds)}.`
}

/** Every code the members, Invitations and Teams routes can return that the portal has words for. */
export const MANAGE_CODES = [
  ERRORS['request.invalid'].code,
  ERRORS['request.idempotency_key_reused'].code,
  ERRORS['request.idempotency_in_progress'].code,
  ERRORS['auth.unauthenticated'].code,
  ERRORS['auth.forbidden'].code,
  ERRORS['rate.limited'].code,
  ERRORS['server.internal'].code,
  ERRORS['server.unavailable'].code,
  ERRORS['server.timeout'].code,
  CORE_ERRORS['organization.not_found'].code,
  CORE_ERRORS['organization.suspended'].code,
  CORE_ERRORS['organization.deleted'].code,
  CORE_ERRORS['member.not_found'].code,
  CORE_ERRORS['member.last_owner'].code,
  CORE_ERRORS['invitation.already_pending'].code,
  CORE_ERRORS['invitation.not_found'].code,
  CORE_ERRORS['team.not_found'].code,
  CORE_ERRORS['team.name_taken'].code,
  CLIENT_ERRORS.timeout,
  CLIENT_ERRORS.network,
  CLIENT_ERRORS.badResponse,
] as const

type HandledCode = (typeof MANAGE_CODES)[number]

const RULES: { readonly [C in HandledCode]: (wait: number | undefined) => ShownFailure } = {
  [ERRORS['request.invalid'].code]: () => ({
    message: 'Check the details you entered and try again.',
  }),
  [ERRORS['request.idempotency_key_reused'].code]: () => ({
    message: 'That request was already used for something else. Reload the page and try again.',
  }),
  [ERRORS['request.idempotency_in_progress'].code]: (wait) => ({
    message: `The first try is still running. Wait, then check the list before trying again. ${tryAgain(wait)}`,
  }),
  [ERRORS['auth.unauthenticated'].code]: () => ({
    message: 'Your session has ended. Sign in again.',
  }),
  [ERRORS['auth.forbidden'].code]: () => ({
    message:
      'Your role does not allow this. Ask an Owner or Admin of your Organization if you need it.',
  }),
  [ERRORS['rate.limited'].code]: (wait) => ({
    message: `Too many tries. ${tryAgain(wait)}`,
  }),
  [ERRORS['server.internal'].code]: () => ({
    message: 'Something went wrong on our side. Try again.',
  }),
  [ERRORS['server.unavailable'].code]: (wait) => ({
    message: `Closeline is busy right now, or the email could not be sent. ${tryAgain(wait)}`,
  }),
  [ERRORS['server.timeout'].code]: () => ({ message: 'That took too long. Try again.' }),
  [CORE_ERRORS['organization.not_found'].code]: () => ({
    message: 'We could not find your Organization. Sign in again.',
  }),
  [CORE_ERRORS['organization.suspended'].code]: () => ({
    message: 'Your Organization is suspended, so its people cannot be changed.',
  }),
  [CORE_ERRORS['organization.deleted'].code]: () => ({
    message: 'Your Organization has been deleted.',
  }),
  [CORE_ERRORS['member.not_found'].code]: () => ({
    message: 'That member is no longer in your Organization. Reload the list.',
  }),
  [CORE_ERRORS['member.last_owner'].code]: () => ({
    message: 'The last Owner cannot be removed or demoted. Make another member an Owner first.',
  }),
  [CORE_ERRORS['invitation.already_pending'].code]: () => ({
    field: 'email',
    message: 'This address already has a pending Invitation. Revoke it to send a new one.',
  }),
  [CORE_ERRORS['invitation.not_found'].code]: () => ({
    message: 'That Invitation is no longer pending. Reload the list.',
  }),
  [CORE_ERRORS['team.not_found'].code]: () => ({
    message: 'That Team no longer exists. Reload the list.',
  }),
  [CORE_ERRORS['team.name_taken'].code]: () => ({
    field: 'name',
    message: 'A Team with that name already exists. Choose a different name.',
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

/**
 * Turns a failure into plain words (branching on the code, never the status), with the field it
 * belongs to if any. `route` says which call failed where a code means more than one thing.
 */
export function presentManage(error: unknown, route?: 'invitation'): ShownFailure {
  if (!(error instanceof ApiError) || !Object.hasOwn(RULES, error.code)) {
    return { message: GENERIC_MESSAGE }
  }
  if (route === 'invitation' && error.code === ERRORS['rate.limited'].code) {
    // Core answers rate.limited here for two reasons (too many pending, or too many sent in a
    // day) and the code does not say which, so the words cover both.
    return {
      message: `Your Organization has too many pending Invitations, or has sent too many recently. Revoke any you no longer need, or wait. ${tryAgain(error.retryAfterSeconds)}`,
    }
  }
  return RULES[error.code as HandledCode](error.retryAfterSeconds)
}

/**
 * Whether a failed write may have reached the server, so a retry must carry the same idempotency
 * key: no answer, a timeout, a busy or failing server, or the first try still running. A definite
 * refusal (any other 4xx) ends the key.
 */
export function outcomeUnknown(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return true
  }
  return (
    error.status === 0 ||
    error.status >= 500 ||
    error.code === CLIENT_ERRORS.badResponse ||
    error.code === ERRORS['request.idempotency_in_progress'].code
  )
}
