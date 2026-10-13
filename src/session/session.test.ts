import { describe, expect, test } from 'bun:test'
import { AUTH_ERRORS } from 'tula-closeline-contract'
import type { SessionTokens } from '~/api/auth'
import { ApiError } from '~/api/errors'
import { createSession, type SessionChannel, type SessionMessage } from '~/session/session'
import { tokens } from '~/testing/fixtures'

const T0 = Date.parse('2026-10-13T10:00:00Z')

function setup(
  options: {
    refresh?: () => Promise<SessionTokens>
    revoke?: () => Promise<void>
    channel?: SessionChannel
  } = {}
) {
  let now = T0
  const refreshed: number[] = []
  const revoked: number[] = []
  const session = createSession({
    now: () => now,
    skewMs: 15_000,
    ...(options.channel ? { channel: options.channel } : {}),
    refresh: async () => {
      refreshed.push(now)
      return options.refresh
        ? options.refresh()
        : tokens({ now, accessToken: `access-${refreshed.length + 1}` })
    },
    revoke: async () => {
      revoked.push(now)
      await options.revoke?.()
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

  test('renews the access token before it expires, each time by one refresh with no token in it', async () => {
    const { session, refreshed, advance } = setup()
    session.start(tokens({ now: T0, ttlMs: 60_000 }))
    advance(50_000)
    expect(await session.accessToken()).toBe('access-2')
    advance(50_000)
    expect(await session.accessToken()).toBe('access-3')
    expect(refreshed).toHaveLength(2)
  })

  test('callers that need a token at the same moment share one refresh', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { session, refreshed, advance } = setup({
      refresh: async () => {
        await gate
        return tokens({ now: T0 + 50_000, accessToken: 'access-2' })
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
  test.each([401])(
    'is refused with %d: the session ends and the sign-in screen can say so',
    async (status) => {
      const { session, advance } = setup({
        refresh: async () => {
          throw new ApiError({ code: AUTH_ERRORS['session.expired'].code, status })
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
  test('asks the service to end the session, then forgets the access token', async () => {
    const { session, revoked } = setup()
    session.start(tokens({ now: T0 }))
    await session.signOut()
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: false })
    expect(revoked).toHaveLength(1)
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
        return tokens({ now: T0, accessToken: 'late' })
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
    made.session.start(tokens({ now: T0, accessToken: 'access-A' }))
    return made
  }

  test('a late rejection of the old session does not end the next one', async () => {
    const { session, refreshed } = signedInAsA()
    await session.signOut()
    session.start(tokens({ now: T0, accessToken: 'access-B' }))
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
    session.start(tokens({ now: T0, accessToken: 'access-B' }))
    await session.refresh('access-A')
    expect(refreshed).toEqual([])
    expect(await session.accessToken()).toBe('access-B')
  })

  test('a second refresh for a token another caller already replaced does nothing', async () => {
    const { session, refreshed } = signedInAsA()
    await session.refresh('access-A')
    await session.refresh('access-A')
    expect(refreshed).toHaveLength(1)
    expect(await session.accessToken()).toBe('access-2')
  })

  test('a refresh with nobody signed in does nothing', async () => {
    const { session, refreshed } = setup()
    await session.refresh('access-A')
    expect(refreshed).toEqual([])
    expect(session.getSnapshot().status).toBe('signed_out')
  })
})

describe('the epoch', () => {
  test('changes on every start and every end of a session, and not on a refresh', async () => {
    const { session, advance } = setup()
    const seen = [session.epoch()]
    session.start(tokens({ now: T0 }))
    seen.push(session.epoch())
    advance(50_000)
    await session.accessToken()
    expect(session.epoch()).toBe(seen[1] as number)
    await session.signOut()
    seen.push(session.epoch())
    session.start(tokens({ now: T0 }))
    seen.push(session.epoch())
    session.rejected('access-1')
    seen.push(session.epoch())
    expect(new Set(seen).size).toBe(seen.length)
  })

  test('changes on a start alone, even with no sign-out before it', () => {
    const { session } = setup()
    const before = session.epoch()
    session.start(tokens({ now: T0 }))
    expect(session.epoch()).not.toBe(before)
  })

  test('changes on an end alone', () => {
    const { session } = setup()
    session.start(tokens({ now: T0 }))
    const before = session.epoch()
    session.rejected('access-1')
    expect(session.epoch()).not.toBe(before)
  })

  test('starting over a live session ends the old one first, so subscribers see it signed out', () => {
    const { session } = setup()
    session.start(tokens({ now: T0, accessToken: 'access-A' }))
    const states: string[] = []
    session.subscribe(() => states.push(session.getSnapshot().status))
    session.start(tokens({ now: T0, accessToken: 'access-B' }))
    expect(states).toEqual(['signed_out', 'signed_in'])
  })
})

/** An in-memory line between tabs: a message posted by one tab reaches every other tab, never the sender. */
function tabBus() {
  const tabs: { listener: ((message: SessionMessage) => void) | null }[] = []
  const posted: SessionMessage[] = []
  return {
    posted,
    join(): SessionChannel {
      const tab: { listener: ((message: SessionMessage) => void) | null } = { listener: null }
      tabs.push(tab)
      return {
        post(message) {
          posted.push(message)
          for (const other of tabs) {
            if (other !== tab) {
              other.listener?.(message)
            }
          }
        },
        subscribe(listener) {
          tab.listener = listener
          return () => {
            tab.listener = null
          }
        },
        close() {
          tab.listener = null
        },
      }
    },
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('restoring the session on load', () => {
  test('is pending from the moment it starts and signed in once the refresh answers', async () => {
    const answer = deferred<SessionTokens>()
    const { session } = setup({ refresh: () => answer.promise })
    const restored = session.restore()
    expect(session.getSnapshot()).toEqual({ status: 'restoring' })
    answer.resolve(tokens({ now: T0, organization: { id: 'org_7', role: 'rep' } }))
    await restored
    expect(session.getSnapshot()).toEqual({
      status: 'signed_in',
      organization: { id: 'org_7', role: 'rep' },
    })
    expect(await session.accessToken()).toBe('access-1')
  })

  test('a 401 means signed out, and not "ended": there was no session to end', async () => {
    const { session } = setup({
      refresh: async () => {
        throw new ApiError({ code: AUTH_ERRORS['session.invalid_token'].code, status: 401 })
      },
    })
    await session.restore()
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: false })
  })

  test.each([
    ['no answer', 0, 'client.network'],
    ['a timeout', 0, 'client.timeout'],
    ['a 500', 500, 'server.internal'],
    ['a 503', 503, 'server.unavailable'],
  ])(
    '%s means unreachable, not signed out, and a retry can still sign in',
    async (_name, status, code) => {
      let fail = true
      const { session, refreshed } = setup({
        refresh: async () => {
          if (fail) {
            throw new ApiError({ code, status })
          }
          return tokens({ now: T0 })
        },
      })
      await session.restore()
      expect(session.getSnapshot()).toEqual({ status: 'unreachable' })
      fail = false
      const retried = session.restore()
      expect(session.getSnapshot()).toEqual({ status: 'restoring' })
      await retried
      expect(session.getSnapshot().status).toBe('signed_in')
      expect(refreshed).toHaveLength(2)
    }
  )

  test('restore never rejects, and restoring over a signed-in session does nothing', async () => {
    const { session, refreshed } = setup()
    session.start(tokens({ now: T0 }))
    await session.restore()
    expect(refreshed).toEqual([])
    expect(session.getSnapshot().status).toBe('signed_in')
  })

  test('a call that needs the token while the restore is in flight waits for it', async () => {
    const answer = deferred<SessionTokens>()
    const { session } = setup({ refresh: () => answer.promise })
    void session.restore()
    const token = session.accessToken()
    answer.resolve(tokens({ now: T0, accessToken: 'restored' }))
    expect(await token).toBe('restored')
  })
})

describe('one refresh at a time', () => {
  test('ten concurrent callers of every kind send exactly one refresh request', async () => {
    const answer = deferred<SessionTokens>()
    const { session, refreshed, advance } = setup({ refresh: () => answer.promise })
    session.start(tokens({ now: T0 }))
    advance(50_000)
    const callers = [
      ...Array.from({ length: 5 }, () => session.accessToken()),
      ...Array.from({ length: 4 }, () => session.refresh('access-1')),
      session.restore(),
    ]
    answer.resolve(tokens({ now: T0 + 50_000, accessToken: 'access-2' }))
    await Promise.all(callers)
    expect(refreshed).toHaveLength(1)
    expect(await session.accessToken()).toBe('access-2')
  })

  test('ten components restoring together send one refresh', async () => {
    const { session, refreshed } = setup()
    await Promise.all(Array.from({ length: 10 }, () => session.restore()))
    expect(refreshed).toHaveLength(1)
  })

  test('a refresh after the first one finished is a new request', async () => {
    const { session, refreshed, advance } = setup()
    session.start(tokens({ now: T0 }))
    advance(50_000)
    await session.accessToken()
    advance(50_000)
    await session.accessToken()
    expect(refreshed).toHaveLength(2)
  })

  test('a refresh refused for good ends the session once, for everyone waiting', async () => {
    const answer = deferred<SessionTokens>()
    const { session, refreshed, advance } = setup({ refresh: () => answer.promise })
    session.start(tokens({ now: T0 }))
    advance(50_000)
    const waiting = [session.accessToken(), session.accessToken()].map((call) =>
      call.then(
        () => 'ok',
        () => 'failed'
      )
    )
    answer.reject(new ApiError({ code: AUTH_ERRORS['session.expired'].code, status: 401 }))
    expect(await Promise.all(waiting)).toEqual(['failed', 'failed'])
    expect(refreshed).toHaveLength(1)
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: true })
  })
})

describe('signing out and the other tabs', () => {
  test('calls auth first and clears memory only after it answers', async () => {
    const answer = deferred<void>()
    const seen: string[] = []
    const { session } = setup({
      revoke: async () => {
        seen.push(session.getSnapshot().status)
        await answer.promise
      },
    })
    session.start(tokens({ now: T0 }))
    const done = session.signOut()
    expect(seen).toEqual(['signed_in'])
    expect(session.getSnapshot().status).toBe('signed_in')
    answer.resolve()
    await done
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: false })
    expect(await session.accessToken()).toBeNull()
  })

  test('clears memory even when auth answers with an error', async () => {
    const { session } = setup({
      revoke: async () => {
        throw new ApiError({ code: 'server.internal', status: 500 })
      },
    })
    session.start(tokens({ now: T0 }))
    await session.signOut()
    expect(session.getSnapshot().status).toBe('signed_out')
    expect(await session.accessToken()).toBeNull()
  })

  test('other tabs drop their in-memory access token when one tab signs out', async () => {
    const bus = tabBus()
    const a = setup({ channel: bus.join() })
    const b = setup({ channel: bus.join() })
    a.session.start(tokens({ now: T0 }))
    b.session.start(tokens({ now: T0, accessToken: 'access-in-b' }))
    expect(await b.session.accessToken()).toBe('access-in-b')
    await a.session.signOut()
    expect(b.session.getSnapshot().status).toBe('signed_out')
    expect(await b.session.accessToken()).toBeNull()
    // Tab B did not call auth: tab A already ended the session.
    expect(b.revoked).toEqual([])
  })

  test('the messages carry no token, only "signed_in" or "signed_out"', async () => {
    const bus = tabBus()
    const a = setup({ channel: bus.join() })
    bus.join()
    a.session.start(
      tokens({
        now: T0,
        accessToken: 'secret-access',
        organization: { id: 'org_1', role: 'owner' },
      })
    )
    await a.session.signOut()
    expect(bus.posted).toEqual([{ type: 'signed_in' }, { type: 'signed_out' }])
    expect(JSON.stringify(bus.posted)).not.toContain('secret-access')
  })

  test('a tab that hears "signed_in" while signed out picks the session up from the shared cookie', async () => {
    const bus = tabBus()
    const a = setup({ channel: bus.join() })
    const b = setup({ channel: bus.join() })
    a.session.start(tokens({ now: T0 }))
    await Promise.resolve()
    await Promise.resolve()
    expect(b.refreshed).toHaveLength(1)
    expect(b.session.getSnapshot().status).toBe('signed_in')
  })

  test('receiving a message does not send one back', async () => {
    const bus = tabBus()
    const a = setup({ channel: bus.join() })
    const b = setup({ channel: bus.join() })
    a.session.start(tokens({ now: T0 }))
    b.session.start(tokens({ now: T0 }))
    bus.posted.length = 0
    await a.session.signOut()
    expect(bus.posted).toEqual([{ type: 'signed_out' }])
    expect(b.session.getSnapshot().status).toBe('signed_out')
  })

  test('disposing stops a tab hearing the others', async () => {
    const bus = tabBus()
    const a = setup({ channel: bus.join() })
    const b = setup({ channel: bus.join() })
    a.session.start(tokens({ now: T0 }))
    b.session.start(tokens({ now: T0 }))
    b.session.dispose()
    await a.session.signOut()
    expect(b.session.getSnapshot().status).toBe('signed_in')
  })
})
