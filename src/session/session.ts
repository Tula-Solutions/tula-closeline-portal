import type { SessionTokens } from '~/api/auth'
import { ApiError } from '~/api/errors'
import type { Authorizer } from '~/api/http'

/** A role in an Organization, as the auth service reports it. */
export type Role = SessionTokens['organization']['role']

/**
 * What the UI may know about the session. The access token is never part of it.
 * `restoring` is the pending state while the refresh made on load is in flight; `unreachable` means
 * that refresh could not reach the service (or got a 5xx or 429), which is not the same as signed
 * out and can be retried; `misconfigured` means auth refused it with another 4xx (a 403 from its
 * Origin check, say), which no retry can fix.
 */
export type SessionSnapshot =
  | { readonly status: 'restoring' }
  | { readonly status: 'unreachable' }
  | { readonly status: 'misconfigured' }
  | { readonly status: 'signed_out'; readonly ended: boolean }
  | {
      readonly status: 'signed_in'
      readonly organization: { readonly id: string; readonly role: Role }
    }

/** What one tab tells the others. It carries no token, only that the session started or ended. */
export type SessionMessage = { readonly type: 'signed_in' } | { readonly type: 'signed_out' }

/** A line to the other tabs of this browser; tests pass an in-memory one. */
export type SessionChannel = {
  /** Sends a message to the other tabs (not to this one). */
  post(message: SessionMessage): void
  /** Calls the listener for each message from another tab; returns the unsubscribe function. */
  subscribe(listener: (message: SessionMessage) => void): () => void
  /** Closes the line. */
  close(): void
}

/** What the session needs from the outside: the two auth calls, a clock and a line to other tabs. */
export type SessionDeps = {
  /** Renews the session from the refresh cookie (the browser sends it; script never sees it). */
  readonly refresh: () => Promise<SessionTokens>
  /** Ends the session on the server, which also clears the cookie. */
  readonly revoke: () => Promise<void>
  readonly channel?: SessionChannel
  /** A monotonic clock in milliseconds (default `performance.now`); deadlines and refresh spacing use it. */
  readonly now?: () => number
  /** The wall clock (default `Date.now`); used only to read an expiry when the server's time is unknown. */
  readonly wallNow?: () => number
  /** The server's current time from the latest auth response's `Date` header, when known. */
  readonly serverNow?: () => number | undefined
  /** Renew when the access token has less than this long left. */
  readonly skewMs?: number
  /** The least time between two proactive refreshes, so a skewed clock cannot make every call refresh. */
  readonly minRefreshGapMs?: number
  /** Called once with an on-load refresh that auth refused with a 4xx a retry cannot fix. */
  readonly onRefused?: (error: ApiError) => void
}

/** The in-memory session: the one holder of the access token, and the HTTP client's Authorizer. */
export type Session = Authorizer & {
  /** The current state, a new object only when it changes (for `useSyncExternalStore`). */
  getSnapshot(): SessionSnapshot
  /** Calls the listener after each change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Starts the session from the tokens a completed sign-in or sign-up returned. */
  start(tokens: SessionTokens): void
  /** Restores the session by refreshing once (also the retry after `unreachable`). Never rejects. */
  restore(): Promise<void>
  /** Asks auth to end the session, then forgets the access token whatever the answer; tells the other tabs. */
  signOut(): Promise<void>
  /** Stops listening to the other tabs. */
  dispose(): void
}

/** The tokens and the monotonic-clock time at which the access token expires. */
type Held = { readonly tokens: SessionTokens; readonly deadline: number }

const FALLBACK_LIFETIME_MS = 60_000

const SIGNED_OUT: SessionSnapshot = { status: 'signed_out', ended: false }
const ENDED: SessionSnapshot = { status: 'signed_out', ended: true }
const RESTORING: SessionSnapshot = { status: 'restoring' }
const UNREACHABLE: SessionSnapshot = { status: 'unreachable' }
const MISCONFIGURED: SessionSnapshot = { status: 'misconfigured' }

/** True when auth refused the refresh cookie for good (401), as opposed to being unreachable or failing. */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/** True for a 4xx a retry cannot fix: not a refusal (401), not busy (429), not a timeout (408). */
function isConfigurationFault(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status)
  )
}

const CHANNEL_NAME = 'closeline-session'

/** A line over `BroadcastChannel`, or null where the browser has none. It carries `signed_in` / `signed_out` only. */
export function createBroadcastSessionChannel(): SessionChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null
  }
  const channel = new BroadcastChannel(CHANNEL_NAME)
  return {
    post: (message) => channel.postMessage({ type: message.type }),
    subscribe(listener) {
      const handle = (event: MessageEvent) => {
        const type: unknown = (event.data as { type?: unknown } | null)?.type
        if (type === 'signed_in' || type === 'signed_out') {
          listener({ type })
        }
      }
      channel.addEventListener('message', handle)
      return () => channel.removeEventListener('message', handle)
    },
    close: () => channel.close(),
  }
}

/**
 * Creates the session. The access token lives only in this closure (never storage, never a URL, no
 * cookie script can read); the refresh token is a cookie only auth receives. Every refresh, from
 * the load, an expiring token or a 401, shares one in-flight promise, so one tab never sends two.
 */
export function createSession(deps: SessionDeps): Session {
  const now = deps.now ?? (() => performance.now())
  const wallNow = deps.wallNow ?? Date.now
  const skewMs = deps.skewMs ?? 15_000
  const minGapMs = deps.minRefreshGapMs ?? 10_000
  const listeners = new Set<() => void>()
  let held: Held | null = null
  let snapshot: SessionSnapshot = SIGNED_OUT
  let inFlight: Promise<void> | null = null
  let signingOut: Promise<void> | null = null
  let epoch = 0
  // Bumped whenever the session is cleared, so a refresh started before never touches what follows.
  let generation = 0
  let lastRefreshAt = Number.NEGATIVE_INFINITY

  const publish = (next: SessionSnapshot) => {
    snapshot = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  const hold = (tokens: SessionTokens) => {
    // Lifetime = expiry minus the server's clock (else the browser's, at arrival); the deadline is
    // then kept on the monotonic clock, so neither a skewed nor a changed wall clock moves it.
    const lifetime = Date.parse(tokens.accessTokenExpiresAt) - (deps.serverNow?.() ?? wallNow())
    held = {
      tokens,
      deadline: now() + (Number.isFinite(lifetime) ? Math.max(lifetime, 0) : FALLBACK_LIFETIME_MS),
    }
    const previous = snapshot
    if (
      previous.status !== 'signed_in' ||
      previous.organization.id !== tokens.organization.id ||
      previous.organization.role !== tokens.organization.role
    ) {
      publish({
        status: 'signed_in',
        organization: { id: tokens.organization.id, role: tokens.organization.role },
      })
    }
  }

  const clear = (ended: boolean) => {
    epoch += 1
    generation += 1
    inFlight = null
    held = null
    publish(ended ? ENDED : SIGNED_OUT)
  }

  /** The one refresh. A result that arrives after the session changed (sign-out, a new sign-in) is dropped. */
  const refreshShared = (): Promise<void> => {
    if (inFlight) {
      return inFlight
    }
    const startedIn = epoch
    const startedGeneration = generation
    const hadSession = held !== null
    lastRefreshAt = now()
    const run = (async () => {
      try {
        const next = await deps.refresh()
        if (epoch !== startedIn) {
          return
        }
        if (held !== null && held.tokens.organization.id !== next.organization.id) {
          // Another Organization: the old one's data must go before the new one is shown.
          clear(false)
        }
        if (held === null) {
          epoch += 1
        }
        hold(next)
      } catch (error) {
        if (epoch === startedIn && isRefusal(error)) {
          clear(hadSession)
        }
        throw error
      } finally {
        if (generation === startedGeneration) {
          inFlight = null
        }
      }
    })()
    inFlight = run
    return run
  }

  const restore = async (): Promise<void> => {
    if (snapshot.status === 'signed_in') {
      return
    }
    if (snapshot.status !== 'restoring') {
      publish(RESTORING)
    }
    try {
      await refreshShared()
      // Every way out of `restoring` publishes; this catches a result that was dropped.
      if (snapshot.status === 'restoring') {
        publish(SIGNED_OUT)
      }
    } catch (error) {
      // A 401 already published signed_out; anything else leaves the person's state unknown.
      if (snapshot.status === 'restoring' && !isRefusal(error)) {
        if (isConfigurationFault(error)) {
          publish(MISCONFIGURED)
          deps.onRefused?.(error)
        } else {
          publish(UNREACHABLE)
        }
      }
    }
  }

  const unsubscribeChannel = deps.channel?.subscribe((message) => {
    if (message.type === 'signed_out') {
      if (held !== null || snapshot.status !== 'signed_out') {
        clear(false)
      }
    } else if (snapshot.status === 'signed_out') {
      // Another tab signed in: the shared cookie lets this one pick the session up.
      void restore()
    }
  })

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    epoch: () => epoch,
    start(tokens) {
      // A session started over a live one (a slow sign-in finishing late) ends the old one first,
      // so its cached data is cleared before the new person's begins.
      if (held !== null) {
        clear(false)
      }
      epoch += 1
      hold(tokens)
      deps.channel?.post({ type: 'signed_in' })
    },
    restore,
    refresh(token) {
      // A caller holding a token that has since been replaced (or ended) has nothing to renew.
      if (held === null || held.tokens.accessToken !== token) {
        return Promise.resolve()
      }
      return refreshShared()
    },
    async accessToken() {
      if (snapshot.status === 'restoring' && inFlight) {
        await inFlight.catch(() => {})
      }
      if (held === null) {
        return null
      }
      // A proactive refresh, at most one per `minGapMs`; a 401 from a service refreshes regardless.
      if (
        held.deadline - now() <= skewMs &&
        (inFlight !== null || now() - lastRefreshAt >= minGapMs)
      ) {
        await refreshShared()
      }
      return held?.tokens.accessToken ?? null
    },
    rejected(token) {
      if (held !== null && held.tokens.accessToken === token) {
        clear(true)
      }
    },
    signOut() {
      if (signingOut) {
        return signingOut
      }
      const startedIn = epoch
      const run = (async () => {
        try {
          if (snapshot.status !== 'signed_out') {
            try {
              await deps.revoke()
            } catch {
              // Memory is cleared below whatever the answer; the service ends the session at its idle limit.
            }
          }
          if (epoch === startedIn) {
            clear(false)
          }
          deps.channel?.post({ type: 'signed_out' })
        } finally {
          signingOut = null
        }
      })()
      signingOut = run
      return run
    },
    dispose() {
      unsubscribeChannel?.()
      deps.channel?.close()
    },
  }
}
