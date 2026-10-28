/**
 * The error codes the widget branches on. They are written out because the widget ships as one
 * classic script that a customer's page loads from another origin, and importing the contract's
 * runtime would split it into a module chunk that needs CORS. `chat.test.ts` checks each code
 * against the contract's maps, so none can drift.
 */
export const CODES = {
  originNotAllowed: 'chat.origin_not_allowed',
  keyInvalid: 'chat.key_invalid',
  sessionClosed: 'chat.session_closed',
  sessionNotFound: 'chat.session_not_found',
  wordingMissing: 'chat.consent_wording_missing',
  invalid: 'request.invalid',
  rateLimited: 'rate.limited',
  inProgress: 'request.idempotency_in_progress',
  unavailable: 'server.unavailable',
} as const
