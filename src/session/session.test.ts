import { describe, expect, test } from 'bun:test'
import type { SessionTokens } from '~/api/auth'
import { ApiError } from '~/api/errors'
import { createSession } from '~/session/session'
import { tokens } from '~/testing/fixtures'

const T0 = Date.parse('2026-10-13T10:00:00Z')

function setup(
  options: {
    refresh?: (token: string) => Promise<SessionTokens>
    revoke?: (token: string) => Promise<void>
  } = {}
) {
  let now = T0
  const refreshed: string[] = []
  const revoked: string[] = []
  const session = createSession({
    now: () => now,
    skewMs: 15_000,
    refresh: async (token) => {
      refreshed.push(token)
      return options.refresh
        ? options.refresh(token)
        : tokens({
            now,
            accessToken: `access-${refreshed.length + 1}`,
            refreshToken: `refresh-${refreshed.length + 1}`,
          })
    },
    revoke: async (token) => {
      revoked.push(token)
      await options.revoke?.(token)
    },
  })
  return {
    session,
    refreshed,
    revoked,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('a started session', () => {
  test('shows the Organization and role, and nothing else, to the UI', () => {
    const { session } = setup()
    session.start(tokens({ now: T0, organization: { id: 'org_9', role: 'admin' } }))
    expect(session.getSnapshot()).toEqual({
      status: 'signed_in',
      organization: { id: 'org_9', role: 'admin' },
    })
    expect(JSON.stringify(session.getSnapshot())).not.toContain('access-1')
    expect(JSON.stringify(session.getSnapshot())).not.toContain('refresh-1')
  })

  test('never writes a token to localStorage or sessionStorage, before or after a refresh', async () => {
    const { session, advance } = setup()
    session.start(tokens({ now: T0 }))
    advance(50_000)
    await session.accessToken()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })

  test('hands out the access token without a refresh while it has time left', async () => {
    const { session, refreshed, advance } = setup()
    session.start(tokens({ now: T0, ttlMs: 60_000 }))
    advance(30_000)
    expect(await session.accessToken()).toBe('access-1')
    expect(refreshed).toEqual([])
  })

  test('renews the access token before it expires, and uses the rotated refresh token next time', async () => {
    const { session, refreshed, advance } = setup()
    session.start(tokens({ now: T0, ttlMs: 60_000 }))
    advance(50_000)
    expect(await session.accessToken()).toBe('access-2')
    advance(50_000)
    expect(await session.accessToken()).toBe('access-3')
    expect(refreshed).toEqual(['refresh-1', 'refresh-2'])
  })

  test('callers that need a token at the same moment share one refresh', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { session, refreshed, advance } = setup({
      refresh: async () => {
        await gate
        return tokens({ now: T0 + 50_000, accessToken: 'access-2', refreshToken: 'refresh-2' })
      },
    })
    session.start(tokens({ now: T0 }))
    advance(50_000)
    const answers = Promise.all([
      session.accessToken(),
      session.accessToken(),
      session.refresh('access-1'),
    ])
    release()
    expect((await answers).slice(0, 2)).toEqual(['access-2', 'access-2'])
    expect(refreshed).toHaveLength(1)
  })

  test('tells subscribers about changes, and not after they unsubscribe', () => {
    const { session } = setup()
    let calls = 0
    const stop = session.subscribe(() => {
      calls += 1
    })
    session.start(tokens({ now: T0 }))
    expect(calls).toBe(1)
    stop()
    session.rejected('access-1')
    expect(calls).toBe(1)
  })
})

describe('a refresh that fails', () => {
  test.each([401, 403])(
    'is refused with %d: the session ends and the sign-in screen can say so',
    async (status) => {
      const { session, advance } = setup({
        refresh: async () => {
          throw new ApiError({ code: 'session.expired', status })
        },
      })
      session.start(tokens({ now: T0 }))
      advance(50_000)
      await expect(session.accessToken()).rejects.toBeInstanceOf(ApiError)
      expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: true })
      expect(await session.accessToken()).toBeNull()
    }
  )

  test.each([0, 500, 503])('with status %d keeps the session for another try', async (status) => {
    const { session, advance } = setup({
      refresh: async () => {
        throw new ApiError({ code: 'server.unavailable', status })
      },
    })
    session.start(tokens({ now: T0 }))
    advance(50_000)
    await expect(session.accessToken()).rejects.toBeInstanceOf(ApiError)
    expect(session.getSnapshot().status).toBe('signed_in')
  })
})

describe('signing out', () => {
  test('forgets the tokens at once and asks the service to end the session', async () => {
    const { session, revoked } = setup()
    session.start(tokens({ now: T0 }))
    await session.signOut()
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: false })
    expect(revoked).toEqual(['refresh-1'])
    expect(await session.accessToken()).toBeNull()
  })

  test('succeeds locally even when the service cannot be reached', async () => {
    const { session } = setup({
      revoke: async () => {
        throw new ApiError({ code: 'client.network', status: 0 })
      },
    })
    session.start(tokens({ now: T0 }))
    await session.signOut()
    expect(session.getSnapshot().status).toBe('signed_out')
  })

  test('signing out twice asks the service once', async () => {
    const { session, revoked } = setup()
    session.start(tokens({ now: T0 }))
    await session.signOut()
    await session.signOut()
    expect(revoked).toHaveLength(1)
  })

  test('a refresh that finishes after sign-out does not bring the session back', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { session } = setup({
      refresh: async () => {
        await gate
        return tokens({ now: T0, accessToken: 'late', refreshToken: 'late-refresh' })
      },
    })
    session.start(tokens({ now: T0 }))
    const pending = session.refresh('access-1')
    await session.signOut()
    release()
    await pending
    expect(session.getSnapshot().status).toBe('signed_out')
    expect(await session.accessToken()).toBeNull()
  })
})

describe('a late answer about a token that is no longer held', () => {
  function signedInAsA() {
    const made = setup()
    made.session.start(tokens({ now: T0, accessToken: 'access-A', refreshToken: 'refresh-A' }))
    return made
  }

  test('a late rejection of the old session does not end the next one', async () => {
    const { session, refreshed } = signedInAsA()
    await session.signOut()
    session.start(tokens({ now: T0, accessToken: 'access-B', refreshToken: 'refresh-B' }))
    session.rejected('access-A')
    expect(session.getSnapshot().status).toBe('signed_in')
    expect(await session.accessToken()).toBe('access-B')
    expect(refreshed).toEqual([])
  })

  test('a rejection of the held token ends the session', () => {
    const { session } = signedInAsA()
    session.rejected('access-A')
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: true })
  })

  test('a late refresh request for the old session does not rotate the next one', async () => {
    const { session, refreshed } = signedInAsA()
    await session.signOut()
    session.start(tokens({ now: T0, accessToken: 'access-B', refreshToken: 'refresh-B' }))
    await session.refresh('access-A')
    expect(refreshed).toEqual([])
    expect(await session.accessToken()).toBe('access-B')
  })

  test('a second refresh for a token another caller already replaced does nothing', async () => {
    const { session, refreshed } = signedInAsA()
    await session.refresh('access-A')
    await session.refresh('access-A')
    expect(refreshed).toEqual(['refresh-A'])
    expect(await session.accessToken()).toBe('access-2')
  })

  test('a refresh with nobody signed in does nothing', async () => {
    const { session, refreshed } = setup()
    await session.refresh('access-A')
    expect(refreshed).toEqual([])
    expect(session.getSnapshot().status).toBe('signed_out')
  })
})
