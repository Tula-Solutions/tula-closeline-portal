import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import type { RightsWording } from 'tula-closeline-contract'
import { AppRoot } from '~/AppRoot'
import type { SessionTokens } from '~/api/auth'
import { createApp } from '~/app'
import { type Env, parseEnv } from '~/env'
import { createReporter } from '~/report/reporter'
import { createAppRouter } from '~/router'
import type { SessionChannel } from '~/session/session'
import { fakeFetch, type Handler, json, route, TEST_ENV, tokens } from '~/testing/fixtures'

/** The Organization core returns, in the shape the contract defines. */
export function organizationBody(name = 'Northline') {
  return {
    id: `org_${'a'.repeat(32)}`,
    name,
    region: 'us',
    status: 'active',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

/** Answers for the two reads every screen makes: the password rules and the caller's Organization. */
export function defaultReads(organizationName = 'Northline'): Handler[] {
  return [
    route('GET', '/v1/client/password-policy', json(200, { minLength: 10, maxLength: 128 })),
    route('GET', '/v1/organization', json(200, organizationBody(organizationName))),
  ]
}

/** What the auth service returns when a sign-up or sign-in step is done and a session starts. */
export function completeBody(kind: 'sign_up' | 'sign_in', session = tokens()) {
  return {
    id: 'att_1',
    kind,
    expiresAt: '2026-10-13T10:10:00Z',
    step: { status: 'complete', sessionId: session.sessionId },
    session,
  }
}

/** What the auth service returns when an attempt starts. */
export function startedBody(
  kind: 'sign_up' | 'sign_in',
  step: 'needs_email_verification' | 'needs_password',
  destination = 'maya@northline.app'
) {
  return {
    id: 'att_1',
    kind,
    expiresAt: '2026-10-13T10:10:00Z',
    attemptSecret: 'attempt-secret-1',
    step: { status: step, ...(step === 'needs_email_verification' ? { destination } : {}) },
  }
}

/** Renders the whole portal at an address, with the network replaced by the given handlers. */
export function renderPortal(
  options: {
    url?: string
    handlers?: Handler[]
    signedIn?: boolean | SessionTokens
    /** Restore the session by refreshing on load, as `main.tsx` does. */
    restore?: boolean
    channel?: SessionChannel
    /** Replaces the app's wait (a poll delay, a `Retry-After` wait); instant when omitted. */
    sleep?: (milliseconds: number) => Promise<void>
    /** Stands in the text of a rights wording version (the contract's table has one). */
    rightsWording?: (version: number) => RightsWording | undefined
    /** Collects every secret the page registers with the reporter to keep out of reports. */
    redacted?: string[]
    /** Render inside `<StrictMode>`, as `main.tsx` does, so effects run, clean up and run again. */
    strict?: boolean
    /** Stands in `location.assign`, which leaves the page for another origin. */
    assign?: (url: string) => void
    /** Replaces the configuration, for a screen that behaves differently outside `local`. */
    env?: Env
    /** Local-only host of the fake Google issuer, as the env variable would set it. */
    googleFakeIssuerHost?: string
  } = {}
) {
  window.history.replaceState(null, '', options.url ?? '/sign-in')
  const reports: Error[] = []
  const double = fakeFetch(...(options.handlers ?? []), ...defaultReads())
  const app = createApp({
    env:
      options.env ??
      (options.googleFakeIssuerHost
        ? parseEnv({
            VITE_ENVIRONMENT: 'local',
            VITE_GOOGLE_FAKE_ISSUER_HOST: options.googleFakeIssuerHost,
          })
        : TEST_ENV),
    ...(options.assign ? { assign: options.assign } : {}),
    reporter: createReporter(
      (error) => reports.push(error),
      (secret) => options.redacted?.push(secret)
    ),
    fetch: double.fetch,
    sleep: options.sleep ?? (async () => {}),
    ...(options.rightsWording ? { rightsWording: options.rightsWording } : {}),
    random: () => 0,
    ...(options.channel ? { channel: options.channel } : {}),
  })
  if (options.signedIn) {
    app.session.start(options.signedIn === true ? tokens() : options.signedIn)
  }
  app.invitation.captureFromLocation(window.location, window.history)
  if (options.restore) {
    void app.session.restore()
  }
  const history = createMemoryHistory({
    initialEntries: [window.location.pathname + window.location.search],
  })
  const router = createAppRouter(app, history)
  const root = <AppRoot app={app} router={router} />
  render(options.strict ? <StrictMode>{root}</StrictMode> : root)
  return { app, router, calls: double.calls, reports, user: userEvent.setup() }
}

/**
 * Waits until no element shows `text`. It throws a plain error while the text is there, because a
 * failed `expect(element).toBeNull()` formats the whole happy-dom element, which takes seconds on
 * each early poll and can push a test past its timeout.
 */
export function waitUntilGone(text: string): Promise<void> {
  return waitFor(() => {
    if (screen.queryByText(text) !== null) {
      throw new Error(`"${text}" is still on the screen`)
    }
  })
}
