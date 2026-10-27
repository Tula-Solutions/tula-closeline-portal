import {
  AUTH_ERRORS,
  ERRORS,
  errorBodySchema,
  PROSPECT_IMPORT_INVALID_REASONS,
} from 'tula-closeline-contract'

/** Why core refused an import file (a contract value). */
export type ImportInvalidReason = (typeof PROSPECT_IMPORT_INVALID_REASONS)[number]

/** Codes the client itself raises when no service answered; the status is 0. */
export const CLIENT_ERRORS = {
  timeout: 'client.timeout',
  network: 'client.network',
  badResponse: 'client.bad_response',
} as const

const MAX_RETRY_AFTER_SECONDS = 3600

/** A failed call, carrying the contract's `area.reason` code the UI branches on (never the status). */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly retryAfterSeconds: number | undefined
  /** Which identity clashed, on `prospect.duplicate_identity` only. */
  readonly identityKind: 'email' | 'phone' | 'linkedin' | undefined
  /** Why core refused an import file, on `prospect.import_invalid` only. */
  readonly importReason: ImportInvalidReason | undefined

  constructor(init: {
    code: string
    status: number
    retryAfterSeconds?: number
    identityKind?: 'email' | 'phone' | 'linkedin'
    importReason?: ImportInvalidReason
  }) {
    super(init.code)
    this.name = 'ApiError'
    this.code = init.code
    this.status = init.status
    this.retryAfterSeconds = init.retryAfterSeconds
    this.identityKind = init.identityKind
    this.importReason = init.importReason
  }
}

/** Builds an error the client raises itself (timeout, no network, an answer that is not the contract's). */
export function clientError(code: (typeof CLIENT_ERRORS)[keyof typeof CLIENT_ERRORS], status = 0) {
  return new ApiError({ code, status })
}

function clampSeconds(seconds: number): number | undefined {
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(Math.max(Math.ceil(seconds), 1), MAX_RETRY_AFTER_SECONDS)
    : undefined
}

function fromHeader(value: string | null, now: number): number | undefined {
  if (value === null) {
    return undefined
  }
  if (/^\d+$/.test(value.trim())) {
    return clampSeconds(Number(value))
  }
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : clampSeconds((date - now) / 1000)
}

/** Reads a failed response into an ApiError using the contract's error body and `Retry-After`. */
export async function parseErrorResponse(response: Response, now = Date.now()): Promise<ApiError> {
  let body: unknown
  try {
    body = JSON.parse(await response.text())
  } catch {
    body = undefined
  }
  const parsed = errorBodySchema.safeParse(body)
  if (!parsed.success) {
    return clientError(CLIENT_ERRORS.badResponse, response.status)
  }
  const detail = parsed.data.error.details?.retryAfter
  const retryAfterSeconds =
    fromHeader(response.headers.get('retry-after'), now) ??
    (typeof detail === 'number' ? clampSeconds(detail) : undefined)
  const kind = parsed.data.error.details?.identityKind
  const identityKind =
    kind === 'email' || kind === 'phone' || kind === 'linkedin' ? kind : undefined
  const why = parsed.data.error.details?.reason
  const importReason = PROSPECT_IMPORT_INVALID_REASONS.find((reason) => reason === why)
  return new ApiError({
    code: parsed.data.error.code,
    status: response.status,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    ...(identityKind === undefined ? {} : { identityKind }),
    ...(importReason === undefined ? {} : { importReason }),
  })
}

const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  CLIENT_ERRORS.network,
  CLIENT_ERRORS.timeout,
  ERRORS['server.unavailable'].code,
  ERRORS['server.timeout'].code,
  ERRORS['auth.unavailable'].code,
])

/** True for a failure worth a retry on a read: no answer, or the service saying it is busy. */
export function isTransient(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (TRANSIENT_CODES.has(error.code) ||
      // Every area has its own 502/503/504 codes, and a gateway answer has none: the class stays.
      [502, 503, 504].includes(error.status))
  )
}

const UNAUTHENTICATED_CODES: ReadonlySet<string> = new Set([
  ERRORS['auth.unauthenticated'].code,
  ERRORS['auth.token_expired'].code,
  ERRORS['auth.token_invalid'].code,
  AUTH_ERRORS['session.expired'].code,
  AUTH_ERRORS['session.invalid_token'].code,
  AUTH_ERRORS['session.reuse_detected'].code,
  AUTH_ERRORS['session.revoked'].code,
])

const CONTRACT_ERRORS: Readonly<Record<string, { readonly status: number }>> = {
  ...ERRORS,
  ...AUTH_ERRORS,
}

/** The status the contract gives the code; for a code it does not list (or a bare answer), the answer's own. */
function statusOf(error: ApiError): number {
  return CONTRACT_ERRORS[error.code]?.status ?? error.status
}

/** True when the service refused the credential (an access token or the refresh cookie), by code. */
export function isUnauthenticated(error: unknown): error is ApiError {
  return error instanceof ApiError && refused(error)
}

function refused(error: ApiError): boolean {
  return UNAUTHENTICATED_CODES.has(error.code) || statusOf(error) === 401
}

/**
 * True for a refusal a retry cannot fix (a 4xx for the code), other than being unauthenticated or
 * rate limited. A bare 408 or 429 is a proxy or edge, which a retry can fix.
 */
export function isClientFault(error: unknown): error is ApiError {
  if (
    !(error instanceof ApiError) ||
    refused(error) ||
    error.code === ERRORS['rate.limited'].code
  ) {
    return false
  }
  const status = statusOf(error)
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}
