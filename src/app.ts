import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { type AuthApi, CLIENT_TYPE_HEADER, createAuthApi } from '~/api/auth'
import { type CoreApi, createCoreApi } from '~/api/core'
import { createHttpClient, type Fetch } from '~/api/http'
import { createKeyHolder, type KeyHolder } from '~/api/idempotency'
import { createPlaybookApi, type PlaybookApi } from '~/api/playbook'
import type { Env } from '~/env'
import { createInvitationHolder, type InvitationHolder } from '~/invitation'
import type { Reporter } from '~/report/reporter'
import { createSession, type Session, type SessionChannel } from '~/session/session'

/** Everything the screens use, built once: the single place the pieces are wired together. */
export type App = {
  readonly env: Env
  readonly auth: AuthApi
  readonly core: CoreApi
  readonly playbook: PlaybookApi
  /** Waits `milliseconds` (the injected `sleep` in tests): the document poll and a `Retry-After` wait use it. */
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly session: Session
  readonly reporter: Reporter
  readonly queryClient: QueryClient
  readonly invitation: InvitationHolder
  /**
   * The idempotency key of the write in flight, one holder per kind of write (bounded). They live
   * here, not in a screen, so leaving a screen after an unknown outcome keeps the key; they are
   * dropped on sign-out and when the Organization changes.
   */
  readonly keys: KeyHolder
}

/** What `createApp` takes; tests pass a `fetch` double and a no-wait `sleep`. */
export type AppInit = {
  readonly env: Env
  readonly reporter: Reporter
  readonly fetch?: Fetch
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly random?: () => number
  readonly now?: () => number
  readonly timeoutMs?: number
  /** The line to the other tabs; none when omitted (tests), so apps in one process never hear each other. */
  readonly channel?: SessionChannel
  /** The holder that already took the Invitation from the address; a new one when omitted. */
  readonly invitation?: InvitationHolder
}

/** Builds the app: HTTP clients for auth, core and playbook, the session, the query cache and the reporter. */
export function createApp(init: AppInit): App {
  const shared = {
    ...(init.fetch ? { fetch: init.fetch } : {}),
    ...(init.sleep ? { sleep: init.sleep } : {}),
    ...(init.random ? { random: init.random } : {}),
    ...(init.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs }),
  }
  // Every path is same-origin (the host or the dev server routes it to a service), so there is no
  // service URL here and no CORS.
  // The server's clock, from the `Date` of the latest auth response, so an access token's lifetime
  // does not depend on the browser's clock being right.
  const clock = init.now ?? (() => performance.now())
  let serverDate: { readonly at: number; readonly ms: number } | undefined
  const authHttp = createHttpClient({
    ...shared,
    headers: CLIENT_TYPE_HEADER,
    onResponse(response) {
      const ms = Date.parse(response.headers.get('date') ?? '')
      serverDate = Number.isNaN(ms) ? undefined : { at: clock(), ms }
    },
  })
  const auth = createAuthApi(authHttp)
  const session = createSession({
    refresh: () => auth.refresh(),
    revoke: () => auth.signOut(),
    ...(init.channel ? { channel: init.channel } : {}),
    ...(init.now ? { now: init.now } : {}),
    serverNow: () =>
      serverDate === undefined ? undefined : serverDate.ms + (clock() - serverDate.at),
    // Status and code only: the error carries nothing else, and 4xx is otherwise never reported.
    onRefused: (error) =>
      init.reporter.report(new Error(`Session restore refused: ${error.status} ${error.code}`)),
  })
  const coreHttp = createHttpClient({ ...shared, authorizer: session })
  const sleep =
    init.sleep ??
    ((milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds)))
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => init.reporter.report(error) }),
    mutationCache: new MutationCache({ onError: (error) => init.reporter.report(error) }),
    defaultOptions: {
      // The HTTP client owns retries; a mutation's result (and so any token) is not kept around.
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
      mutations: { retry: false, gcTime: 0 },
    },
  })
  const keys = createKeyHolder()
  const organizationOf = () => {
    const snapshot = session.getSnapshot()
    return snapshot.status === 'signed_in' ? snapshot.organization.id : null
  }
  let currentOrganization = organizationOf()
  session.subscribe(() => {
    const next = organizationOf()
    // Sign-out, or another Organization (this tab adopted it through a refresh): nothing of the
    // old one may be shown, and no key of a write meant for it may be sent again.
    if (session.getSnapshot().status === 'signed_out' || next !== currentOrganization) {
      queryClient.clear()
      keys.clear()
    }
    currentOrganization = next
  })
  return {
    env: init.env,
    auth,
    core: createCoreApi(coreHttp),
    playbook: createPlaybookApi(coreHttp),
    sleep,
    session,
    reporter: init.reporter,
    queryClient,
    invitation: init.invitation ?? createInvitationHolder(),
    keys,
  }
}
