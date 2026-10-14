import {
  authorizationUrlSchema,
  GOOGLE_ERROR_PARAM,
  googleErrorQuerySchema,
} from 'tula-closeline-contract'

const GOOGLE_HOST = 'accounts.google.com'

/**
 * The URL to send the browser to for Google, or null when it must not be followed. The contract
 * only checks the shape (https, or http to loopback, no credentials); the host is pinned here to
 * `accounts.google.com` and, in local development only, to the configured fake issuer
 * (`fakeIssuerHost` is `host[:port]` and is undefined outside `local`).
 */
export function allowedAuthorizationUrl(
  raw: string,
  fakeIssuerHost: string | undefined
): URL | null {
  if (!authorizationUrlSchema.safeParse(raw).success) {
    return null
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol === 'https:' && url.host === GOOGLE_HOST) {
    return url
  }
  if (fakeIssuerHost !== undefined && url.host === fakeIssuerHost) {
    return url
  }
  return null
}

/** An `area.reason` code: lower-case words joined by one dot. */
const ERROR_CODE = /^[a-z]{1,32}\.[a-z_]{1,64}$/

/** The code the Google callback put in the sign-in address, or undefined when the value is not shaped like one. */
export function googleErrorCode(value: unknown): string | undefined {
  const parsed = googleErrorQuerySchema.safeParse({ [GOOGLE_ERROR_PARAM]: value })
  return parsed.success && ERROR_CODE.test(parsed.data.error) ? parsed.data.error : undefined
}
