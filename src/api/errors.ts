import { errorBodySchema } from 'tula-closeline-contract'

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

  constructor(init: {
    code: string
    status: number
    retryAfterSeconds?: number
    identityKind?: 'email' | 'phone' | 'linkedin'
  }) {
    super(init.code)
    this.name = 'ApiError'
    this.code = init.code
    this.status = init.status
    this.retryAfterSeconds = init.retryAfterSeconds
    this.identityKind = init.identityKind
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
  return new ApiError({
    code: parsed.data.error.code,
    status: response.status,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    ...(identityKind === undefined ? {} : { identityKind }),
  })
}

/** True for a failure worth a retry on a read: no answer, or the service saying it is busy. */
export function isTransient(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504)
  )
}
