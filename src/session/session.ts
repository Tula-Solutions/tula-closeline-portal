import type { SessionTokens } from '~/api/auth'
import { ApiError } from '~/api/errors'
import type { Authorizer } from '~/api/http'

/** A role in an Organization, as the auth service reports it. */
export type Role = SessionTokens['organization']['role']

/**
 * What the UI may know about the session. The access token is never part of it.
 * `restoring` is the pending state while the refresh made on load is in flight; `unreachable` means
 * that refresh could not reach the service (or got a 5xx), which is not the same as signed out.
 */
export type SessionSnapshot =
  | { readonly status: 'restoring' }
  | { readonly status: 'unreachable' }
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
  readonly now?: () => number
  /** Renew when the access token has less than this long left. */
  readonly skewMs?: number
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

type Held = { readonly tokens: SessionTokens; readonly expiresAt: number }

const SIGNED_OUT: SessionSnapshot = { status: 'signed_out', ended: false }
const ENDED: SessionSnapshot = { status: 'signed_out', ended: true }
const RESTORING: SessionSnapshot = { status: 'restoring' }
const UNREACHABLE: SessionSnapshot = { status: 'unreachable' }

/** True when auth refused the refresh cookie for good (401), as opposed to being unreachable or failing. */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
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
  const now = deps.now ?? Date.now
  const skewMs = deps.skewMs ?? 15_000
  const listeners = new Set<() => void>()
  let held: Held | null = null
  let snapshot: SessionSnapshot = SIGNED_OUT
  let inFlight: Promise<void> | null = null
  let signingOut: Promise<void> | null = null
  let epoch = 0

  const publish = (next: SessionSnapshot) => {
    snapshot = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  const hold = (tokens: SessionTokens) => {
    const expiresAt = Date.parse(tokens.accessTokenExpiresAt)
    held = { tokens, expiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt }
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
    held = null
    publish(ended ? ENDED : SIGNED_OUT)
  }

  /** The one refresh. A result that arrives after the session changed (sign-out, a new sign-in) is dropped. */
  const refreshShared = (): Promise<void> => {
    if (inFlight) {
      return inFlight
    }
    const startedIn = epoch
    const hadSession = held !== null
    const run = (async () => {
      try {
        const next = await deps.refresh()
        if (epoch !== startedIn) {
          return
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
        inFlight = null
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
    } catch (error) {
      // A 401 already published signed_out; anything else leaves the person's state unknown.
      if (snapshot.status === 'restoring' && !isRefusal(error)) {
        publish(UNREACHABLE)
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
      if (held.expiresAt - now() <= skewMs) {
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
          if (held !== null) {
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
