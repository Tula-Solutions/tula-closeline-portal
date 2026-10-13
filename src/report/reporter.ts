import * as Sentry from '@sentry/browser'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import type { Env } from '~/env'
import { scrubEvent } from '~/report/scrub'

/** The one door to error reporting; the rest of the app never imports the SDK. */
export type Reporter = {
  /** Reports an unexpected error. Expected ones (validation, 401, 403, 404, 409, 429, offline) are dropped. */
  report(error: unknown): void
}

/** True for an error worth a report: a fault of ours, not something the user can fix or retry. */
export function shouldReport(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500 || error.code === CLIENT_ERRORS.badResponse
  }
  return !(error instanceof DOMException && error.name === 'AbortError')
}

/** Builds a reporter over a capture function; an ApiError is reduced to its status and code. */
export function createReporter(capture: (error: Error) => void): Reporter {
  return {
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
export const noopReporter: Reporter = { report: () => undefined }

/** The Sentry options: no user, cookie, header, body or query data, no replay, no tracing, no breadcrumbs, and every event scrubbed. */
export function sentryOptions(env: Env, dsn: string): Sentry.BrowserOptions {
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
      return scrubEvent(event)
    },
  }
}

/** Starts Sentry and returns the reporter, or a no-op reporter when there is no DSN. */
export function startReporting(env: Env): Reporter {
  if (env.sentryDsn === undefined) {
    return noopReporter
  }
  Sentry.init(sentryOptions(env, env.sentryDsn))
  return createReporter((error) => {
    Sentry.captureException(error)
  })
}
