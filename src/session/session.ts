import type { SessionTokens } from '~/api/auth'
import { ApiError } from '~/api/errors'
import type { Authorizer } from '~/api/http'

/** A role in an Organization, as the auth service reports it. */
export type Role = SessionTokens['organization']['role']

/** What the UI may know about the session. The tokens are never part of it. */
export type SessionSnapshot =
  | { readonly status: 'signed_out'; readonly ended: boolean }
  | {
      readonly status: 'signed_in'
      readonly organization: { readonly id: string; readonly role: Role }
    }

/** What the session needs from the outside: the two auth calls and a clock. */
export type SessionDeps = {
  readonly refresh: (refreshToken: string) => Promise<SessionTokens>
  readonly revoke: (refreshToken: string) => Promise<void>
  readonly now?: () => number
  /** Renew when the access token has less than this long left. */
  readonly skewMs?: number
}

/** The in-memory session: the one holder of the tokens, and the HTTP client's Authorizer. */
export type Session = Authorizer & {
  /** The current state, a new object only when it changes (for `useSyncExternalStore`). */
  getSnapshot(): SessionSnapshot
  /** Calls the listener after each change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Starts the session from the tokens a completed sign-in or sign-up returned. */
  start(tokens: SessionTokens): void
  /** Signs out: forgets the tokens at once, then asks the service to end the session (best effort). */
  signOut(): Promise<void>
}

type Held = { readonly tokens: SessionTokens; readonly expiresAt: number }

const SIGNED_OUT: SessionSnapshot = { status: 'signed_out', ended: false }
const ENDED: SessionSnapshot = { status: 'signed_out', ended: true }

/** True when the service refused the refresh token itself (as opposed to being unreachable). */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

/**
 * Creates the session. Tokens live only in this closure (never storage, never a URL), so a page
 * reload ends the session. One refresh runs at a time and every caller waits for the same one.
 */
export function createSession(deps: SessionDeps): Session {
  const now = deps.now ?? Date.now
  const skewMs = deps.skewMs ?? 15_000
  const listeners = new Set<() => void>()
  let held: Held | null = null
  let snapshot: SessionSnapshot = SIGNED_OUT
  let inFlight: Promise<void> | null = null

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
    held = null
    publish(ended ? ENDED : SIGNED_OUT)
  }

  const refresh = (token: string): Promise<void> => {
    const current = held
    // A caller holding a token that has since been replaced (or ended) has nothing to renew.
    if (current === null || current.tokens.accessToken !== token) {
      return Promise.resolve()
    }
    if (inFlight) {
      return inFlight
    }
    const run = (async () => {
      try {
        const next = await deps.refresh(current.tokens.refreshToken)
        if (held === current) {
          hold(next)
        }
      } catch (error) {
        if (isRefusal(error) && held === current) {
          clear(true)
        }
        throw error
      } finally {
        inFlight = null
      }
    })()
    inFlight = run
    return run
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start: hold,
    refresh,
    async accessToken() {
      if (held === null) {
        return null
      }
      if (held.expiresAt - now() <= skewMs) {
        await refresh(held.tokens.accessToken)
      }
      return held?.tokens.accessToken ?? null
    },
    rejected(token) {
      if (held !== null && held.tokens.accessToken === token) {
        clear(true)
      }
    },
    async signOut() {
      const refreshToken = held?.tokens.refreshToken
      clear(false)
      if (refreshToken === undefined) {
        return
      }
      try {
        await deps.revoke(refreshToken)
      } catch {
        // The tokens are already forgotten; the service ends the session at its idle limit.
      }
    },
  }
}
