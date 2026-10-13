import * as Sentry from '@sentry/browser'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import type { Env } from '~/env'
import { scrubEvent } from '~/report/scrub'

/** The one door to error reporting; the rest of the app never imports the SDK. */
export type Reporter = {
  /** Reports an unexpected error. Expected ones (validation, 401, 403, 404, 409, 429, offline) are dropped. */
  report(error: unknown): void
  /** Registers a literal (an Invitation token) that no report may carry, in any encoding. */
  redact(secret: string): void
}

/** True for an error worth a report: a fault of ours, not something the user can fix or retry. */
export function shouldReport(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500 || error.code === CLIENT_ERRORS.badResponse
  }
  return !(error instanceof DOMException && error.name === 'AbortError')
}

/** Secrets shorter than this are not registered: redacting a short string would hide ordinary words. */
const MIN_SECRET_LENGTH = 16

/** Builds a reporter over a capture function; an ApiError is reduced to its status and code. */
export function createReporter(
  capture: (error: Error) => void,
  redact: (secret: string) => void = () => undefined
): Reporter {
  return {
    redact(secret) {
      if (secret.length >= MIN_SECRET_LENGTH) {
        redact(secret)
      }
    },
    report(error) {
      if (!shouldReport(error)) {
        return
      }
      if (error instanceof ApiError) {
        const reduced = new Error(`API ${error.status} ${error.code}`)
        reduced.name = 'ApiError'
        capture(reduced)
        return
      }
      capture(error instanceof Error ? error : new Error('A non-error value was thrown'))
    },
  }
}

/** A reporter that does nothing: used when no DSN is configured. */
export const noopReporter: Reporter = { report: () => undefined, redact: () => undefined }

/** The Sentry options: no user, cookie, header, body or query data, no replay, no tracing, no breadcrumbs, and every event scrubbed. */
export function sentryOptions(
  env: Env,
  dsn: string,
  secrets: () => readonly string[] = () => []
): Sentry.BrowserOptions {
  return {
    dsn,
    environment: env.environment,
    ...(env.release === undefined ? {} : { release: env.release }),
    // Sentry 11 replaced `sendDefaultPii` with `dataCollection`; each category is off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    // An allowlist: no breadcrumbs, console, HTTP-context, session or culture integrations.
    defaultIntegrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.browserApiErrorsIntegration(),
      Sentry.globalHandlersIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
    ],
    beforeSend(event, hint) {
      if (hint.originalException !== undefined && !shouldReport(hint.originalException)) {
        return null
      }
      return scrubEvent(event, secrets())
    },
  }
}

/**
 * Starts Sentry and returns the reporter, or a no-op reporter when there is no DSN. `overrides`
 * lets a test replace the transport.
 */
export function startReporting(env: Env, overrides: Sentry.BrowserOptions = {}): Reporter {
  if (env.sentryDsn === undefined) {
    return noopReporter
  }
  const secrets = new Set<string>()
  Sentry.init({ ...sentryOptions(env, env.sentryDsn, () => [...secrets]), ...overrides })
  return createReporter(
    (error) => {
      Sentry.captureException(error)
    },
    (secret) => {
      secrets.add(secret)
    }
  )
}
