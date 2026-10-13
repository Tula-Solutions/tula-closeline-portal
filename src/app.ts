import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { type AuthApi, createAuthApi } from '~/api/auth'
import { type CoreApi, createCoreApi } from '~/api/core'
import { createHttpClient, type Fetch } from '~/api/http'
import type { Env } from '~/env'
import { createInvitationHolder, type InvitationHolder } from '~/invitation'
import type { Reporter } from '~/report/reporter'
import { createSession, type Session } from '~/session/session'

/** Everything the screens use, built once: the single place the pieces are wired together. */
export type App = {
  readonly env: Env
  readonly auth: AuthApi
  readonly core: CoreApi
  readonly session: Session
  readonly reporter: Reporter
  readonly queryClient: QueryClient
  readonly invitation: InvitationHolder
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
  /** The holder that already took the Invitation from the address; a new one when omitted. */
  readonly invitation?: InvitationHolder
}

/** Builds the app: HTTP clients for auth and core, the session, the query cache and the reporter. */
export function createApp(init: AppInit): App {
  const shared = {
    ...(init.fetch ? { fetch: init.fetch } : {}),
    ...(init.sleep ? { sleep: init.sleep } : {}),
    ...(init.random ? { random: init.random } : {}),
    ...(init.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs }),
  }
  const authHttp = createHttpClient({
    ...shared,
    baseUrl: init.env.authBaseUrl,
    headers: { 'x-tula-client': 'web' },
  })
  const auth = createAuthApi(authHttp)
  const session = createSession({
    refresh: (refreshToken) => auth.refresh(refreshToken),
    revoke: (refreshToken) => auth.signOut(refreshToken),
    ...(init.now ? { now: init.now } : {}),
  })
  const coreHttp = createHttpClient({
    ...shared,
    baseUrl: init.env.coreBaseUrl,
    authorizer: session,
  })
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => init.reporter.report(error) }),
    mutationCache: new MutationCache({ onError: (error) => init.reporter.report(error) }),
    defaultOptions: {
      // The HTTP client owns retries; a mutation's result (and so any token) is not kept around.
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
      mutations: { retry: false, gcTime: 0 },
    },
  })
  session.subscribe(() => {
    if (session.getSnapshot().status === 'signed_out') {
      queryClient.clear()
    }
  })
  return {
    env: init.env,
    auth,
    core: createCoreApi(coreHttp),
    session,
    reporter: init.reporter,
    queryClient,
    invitation: init.invitation ?? createInvitationHolder(),
  }
}
