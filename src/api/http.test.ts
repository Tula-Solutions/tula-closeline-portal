import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { AUTH_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import { type Authorizer, createHttpClient, sendWithProgress } from '~/api/http'
import { createApp } from '~/app'
import { noopReporter } from '~/report/reporter'
import { createSession } from '~/session/session'
import { failure, fakeFetch, json, route, TEST_ENV, tokens } from '~/testing/fixtures'
import { organizationBody } from '~/testing/render'

const noWait = async () => {}

function client(
  handlers: Parameters<typeof fakeFetch>,
  options: Partial<Parameters<typeof createHttpClient>[0]> = {}
) {
  const double = fakeFetch(...handlers)
  const slept: number[] = []
  const http = createHttpClient({
    fetch: double.fetch,
    sleep: async (ms) => {
      slept.push(ms)
    },
    random: () => 0.5,
    ...options,
  })
  return { http, calls: double.calls, slept }
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('the call did not fail')
}

describe('timeout', () => {
  test('a call that never answers fails with client.timeout and aborts the request', async () => {
    let signal: AbortSignal | undefined
    const http = createHttpClient({
      timeoutMs: 15,
      retries: 0,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    })
    const error = await failureOf(http.request({ path: '/slow' }))
    expect(error.code).toBe(CLIENT_ERRORS.timeout)
    expect(error.status).toBe(0)
    expect(signal?.aborted).toBe(true)
  })

  test('a timeout on a read is retried, a timeout on a write is not', async () => {
    let reads = 0
    let writes = 0
    const http = createHttpClient({
      timeoutMs: 10,
      retries: 2,
      sleep: noWait,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          if (init.method === 'GET') {
            reads += 1
          } else {
            writes += 1
          }
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    })
    expect((await failureOf(http.request({ path: '/r' }))).code).toBe(CLIENT_ERRORS.timeout)
    expect((await failureOf(http.request({ method: 'POST', path: '/w' }))).code).toBe(
      CLIENT_ERRORS.timeout
    )
    expect(reads).toBe(3)
    expect(writes).toBe(1)
  })
})

describe('retry', () => {
  test('a read is retried after a 503 and returns the later answer', async () => {
    let n = 0
    const { http, calls } = client([
      route('GET', '/thing', () =>
        ++n < 3 ? failure(503, 'server.unavailable') : json(200, { ok: 1 })
      ),
    ])
    expect(await http.request({ path: '/thing' })).toEqual({ ok: 1 })
    expect(calls).toHaveLength(3)
  })

  test('retries are bounded', async () => {
    const { http, calls } = client([route('GET', '/thing', failure(503, 'server.unavailable'))], {
      retries: 2,
    })
    expect((await failureOf(http.request({ path: '/thing' }))).code).toBe('server.unavailable')
    expect(calls).toHaveLength(3)
  })

  test.each(['POST', 'PATCH', 'PUT', 'DELETE'] as const)(
    'a %s is sent once even on a 503',
    async (method) => {
      const { http, calls } = client([route(method, '/thing', failure(503, 'server.unavailable'))])
      await failureOf(http.request({ method, path: '/thing', body: {} }))
      expect(calls).toHaveLength(1)
    }
  )

  test('a write that gets no answer is not repeated', async () => {
    const { http, calls } = client([
      () => {
        throw new TypeError('network down')
      },
    ])
    expect((await failureOf(http.request({ method: 'POST', path: '/x' }))).code).toBe(
      CLIENT_ERRORS.network
    )
    expect(calls).toHaveLength(1)
  })

  test.each([400, 401, 403, 404, 409, 422, 429, 500])(
    'a read is not retried on %d',
    async (status) => {
      const { http, calls } = client([route('GET', '/thing', failure(status, 'request.invalid'))])
      await failureOf(http.request({ path: '/thing' }))
      expect(calls).toHaveLength(1)
    }
  )

  test('a Retry-After shorter than the cap is honoured with jitter added', async () => {
    const { http, slept } = client(
      [route('GET', '/thing', failure(503, 'server.unavailable', { retryAfter: 1 }))],
      { retries: 2, backoffMaxMs: 5000, random: () => 0.5 }
    )
    await failureOf(http.request({ path: '/thing' }))
    // the hint plus full jitter: 1000 + random() * min(max, base * 2^n)
    expect(slept).toEqual([1100, 1200])
  })

  test('the jitter is drawn fresh for each wait and grows with the backoff', async () => {
    const draws = [0, 1]
    const { http, slept } = client(
      [route('GET', '/thing', failure(503, 'server.unavailable', { retryAfter: 1 }))],
      { retries: 2, backoffBaseMs: 100, backoffMaxMs: 5000, random: () => draws.shift() ?? 0 }
    )
    await failureOf(http.request({ path: '/thing' }))
    expect(slept[0]).toBe(1000)
    expect(slept[1]).toBe(1200)
  })

  test('a Retry-After longer than the cap stops the retries and surfaces the wait', async () => {
    const { http, calls, slept } = client([
      route('GET', '/thing', failure(503, 'server.unavailable', {}, { 'retry-after': '60' })),
    ])
    const error = await failureOf(http.request({ path: '/thing' }))
    expect(calls).toHaveLength(1)
    expect(slept).toEqual([])
    expect(error.code).toBe('server.unavailable')
    expect(error.retryAfterSeconds).toBe(60)
  })

  test('waits without a hint are jittered and capped', async () => {
    const plain = client([route('GET', '/t', () => new Response(null, { status: 502 }))], {
      retries: 3,
      backoffBaseMs: 100,
      backoffMaxMs: 250,
      random: () => 0.5,
    })
    await failureOf(plain.http.request({ path: '/t' }))
    // full jitter: random() * min(max, base * 2^n)
    expect(plain.slept).toEqual([50, 100, 125])
  })

  test('a read stops retrying when the caller aborts', async () => {
    const controller = new AbortController()
    const { http, calls } = client([
      route('GET', '/thing', () => {
        controller.abort()
        return failure(503, 'server.unavailable')
      }),
    ])
    await failureOf(http.request({ path: '/thing', signal: controller.signal }))
    expect(calls).toHaveLength(1)
  })
})

describe('requests and answers', () => {
  test('sends no cookies and no referrer, a JSON body, and the configured headers', async () => {
    const { http, calls } = client([route('POST', '/v1/x', json(200, { ok: true }))], {
      headers: { 'x-tula-client': 'web' },
    })
    await http.request({
      method: 'POST',
      path: '/v1/x',
      body: { a: 1 },
      headers: { 'x-extra': 'y' },
    })
    const call = calls[0]
    expect(call?.init.credentials).toBe('same-origin')
    expect(call?.init.referrerPolicy).toBe('no-referrer')
    expect(call?.headers.get('content-type')).toBe('application/json')
    expect(call?.headers.get('x-tula-client')).toBe('web')
    expect(call?.headers.get('x-extra')).toBe('y')
    expect(call?.headers.get('authorization')).toBeNull()
    expect(call?.body).toEqual({ a: 1 })
  })

  test.each(['GET', 'POST'] as const)(
    'a %s never follows a redirect, so a body with a token cannot be forwarded',
    async (method) => {
      const double = fakeFetch(
        // What fetch does: with redirect "error" a redirect rejects; otherwise it would follow it.
        (call) => {
          if (call.init.redirect === 'error') {
            throw new TypeError('Failed to fetch: redirect')
          }
          return new Response(null, { status: 307, headers: { location: 'https://evil.test/x' } })
        }
      )
      const http = createHttpClient({ fetch: double.fetch })
      const error = await failureOf(
        http.request({ method, path: '/v1/x', ...(method === 'POST' ? { body: { a: 1 } } : {}) })
      )
      expect(error.code).toBe(CLIENT_ERRORS.network)
      expect(double.calls.every((call) => call.init.redirect === 'error')).toBe(true)
    }
  )

  test('puts query values in the address and skips undefined ones', async () => {
    const { http, calls } = client([route('GET', '/list', json(200, []))])
    await http.request({ path: '/list', query: { limit: 25, cursor: undefined, q: 'a b' } })
    expect(calls[0]?.url).toBe('/list?limit=25&q=a+b')
  })

  test('a 204 answer is undefined', async () => {
    const { http } = client([route('POST', '/out', () => new Response(null, { status: 204 }))])
    expect(await http.request({ method: 'POST', path: '/out' })).toBeUndefined()
  })

  test('a failure becomes an ApiError with the contract code, so callers branch on the code', async () => {
    const { http } = client([
      route('POST', '/x', failure(409, AUTH_ERRORS['flow.invalid_step'].code)),
    ])
    const error = await failureOf(http.request({ method: 'POST', path: '/x' }))
    expect([error.code, error.status]).toEqual([AUTH_ERRORS['flow.invalid_step'].code, 409])
  })

  test('an answer the parser refuses is client.bad_response', async () => {
    const { http } = client([route('GET', '/x', json(200, { nope: true }))])
    const error = await failureOf(
      http.request({
        path: '/x',
        parse: () => {
          throw new Error('shape')
        },
      })
    )
    expect(error.code).toBe(CLIENT_ERRORS.badResponse)
  })

  test('a network failure is client.network', async () => {
    const { http } = client([
      () => {
        throw new TypeError('Failed to fetch')
      },
    ])
    expect((await failureOf(http.request({ path: '/x' }))).code).toBe(CLIENT_ERRORS.network)
  })
})

describe('bearer calls', () => {
  function signedIn(
    handlers: Parameters<typeof fakeFetch>,
    refresh = async () => tokens({ accessToken: 'access-2' })
  ) {
    let refreshes = 0
    const session = createSession({
      refresh: async () => {
        refreshes += 1
        return refresh()
      },
      revoke: async () => {},
    })
    session.start(tokens())
    const made = client(handlers, { authorizer: session })
    return { ...made, session, refreshes: () => refreshes }
  }

  test('sends the access token only when the call asks for it', async () => {
    const { http, calls } = signedIn([route('GET', '/me', json(200, {}))])
    await http.request({ path: '/me', auth: true })
    await http.request({ path: '/me' })
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer access-1')
    expect(calls[1]?.headers.get('authorization')).toBeNull()
  })

  test('an expired token triggers one refresh and one retry with the new token', async () => {
    const { http, calls, refreshes } = signedIn([
      route('GET', '/me', (call) =>
        call.headers.get('authorization') === 'Bearer access-1'
          ? failure(401, ERRORS['auth.token_expired'].code)
          : json(200, { ok: true })
      ),
    ])
    expect(await http.request({ path: '/me', auth: true })).toEqual({ ok: true })
    expect(refreshes()).toBe(1)
    expect(calls.map((call) => call.headers.get('authorization'))).toEqual([
      'Bearer access-1',
      'Bearer access-2',
    ])
  })

  test('concurrent calls that all hit an expired token share one refresh', async () => {
    const { http, refreshes } = signedIn([
      route('GET', '/me', (call) =>
        call.headers.get('authorization') === 'Bearer access-1'
          ? failure(401, ERRORS['auth.token_expired'].code)
          : json(200, { ok: true })
      ),
    ])
    const answers = await Promise.all([
      http.request({ path: '/me', auth: true }),
      http.request({ path: '/me', auth: true }),
      http.request({ path: '/me', auth: true }),
    ])
    expect(answers).toHaveLength(3)
    expect(refreshes()).toBe(1)
  })

  test('only one retry: a second token_expired signs the user out instead of looping', async () => {
    const { http, calls, session, refreshes } = signedIn([
      route('GET', '/me', failure(401, ERRORS['auth.token_expired'].code)),
    ])
    const error = await failureOf(http.request({ path: '/me', auth: true }))
    expect(error.code).toBe(ERRORS['auth.token_expired'].code)
    expect(calls).toHaveLength(2)
    expect(refreshes()).toBe(1)
    expect(session.getSnapshot().status).toBe('signed_out')
  })

  test.each([
    ERRORS['auth.token_invalid'].code,
    ERRORS['auth.unauthenticated'].code,
    AUTH_ERRORS['session.revoked'].code,
  ])(
    'any 401 (%s) gets one refresh and one retry, and a second 401 ends the session',
    async (code) => {
      const { http, calls, session, refreshes } = signedIn([
        route('GET', '/me', failure(401, code)),
      ])
      await failureOf(http.request({ path: '/me', auth: true }))
      expect(refreshes()).toBe(1)
      expect(calls).toHaveLength(2)
      expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: true })
    }
  )

  test('a 401 that a refresh fixes is retried once and the person stays signed in', async () => {
    const { http, calls, session, refreshes } = signedIn([
      route('GET', '/me', (call) =>
        call.headers.get('authorization') === 'Bearer access-1'
          ? failure(401, ERRORS['auth.token_invalid'].code)
          : json(200, { ok: true })
      ),
    ])
    expect(await http.request({ path: '/me', auth: true })).toEqual({ ok: true })
    expect(refreshes()).toBe(1)
    expect(calls).toHaveLength(2)
    expect(session.getSnapshot().status).toBe('signed_in')
  })

  test('ten concurrent calls that all get a 401 send exactly one refresh request', async () => {
    const { http, refreshes } = signedIn([
      route('GET', '/me', (call) =>
        call.headers.get('authorization') === 'Bearer access-1'
          ? failure(401, ERRORS['auth.token_invalid'].code)
          : json(200, { ok: true })
      ),
    ])
    const answers = await Promise.all(
      Array.from({ length: 10 }, () => http.request({ path: '/me', auth: true }))
    )
    expect(answers).toHaveLength(10)
    expect(refreshes()).toBe(1)
  })

  test('a refresh the service refuses signs the user out and surfaces the failure', async () => {
    const { http, session } = signedIn(
      [route('GET', '/me', failure(401, ERRORS['auth.token_expired'].code))],
      async () => {
        throw new ApiError({ code: AUTH_ERRORS['session.reuse_detected'].code, status: 401 })
      }
    )
    const error = await failureOf(http.request({ path: '/me', auth: true }))
    expect(error.code).toBe(AUTH_ERRORS['session.reuse_detected'].code)
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: true })
  })

  test('a refresh that cannot reach the service keeps the session', async () => {
    const { http, session } = signedIn(
      [route('GET', '/me', failure(401, ERRORS['auth.token_expired'].code))],
      async () => {
        throw new ApiError({ code: CLIENT_ERRORS.network, status: 0 })
      }
    )
    const error = await failureOf(http.request({ path: '/me', auth: true }))
    expect(error.code).toBe(CLIENT_ERRORS.network)
    expect(session.getSnapshot().status).toBe('signed_in')
  })

  test('with no session the call fails as unauthenticated and never reaches the network', async () => {
    const rejected: string[] = []
    const authorizer: Authorizer = {
      accessToken: async () => null,
      refresh: async () => {},
      rejected: (token) => rejected.push(token),
      epoch: () => 0,
    }
    const { http, calls } = client([route('GET', '/me', json(200, {}))], { authorizer })
    const error = await failureOf(http.request({ path: '/me', auth: true }))
    expect(error.code).toBe(ERRORS['auth.unauthenticated'].code)
    expect(calls).toHaveLength(0)
    // No token was used, so there is nothing to reject.
    expect(rejected).toEqual([])
  })

  describe('a request never outlives the session it started in', () => {
    function gated() {
      const releases = new Map<string, (response: Response) => void>()
      const sent = new Map<string, Promise<void>>()
      const markSent = new Map<string, () => void>()
      for (const method of ['GET', 'POST']) {
        sent.set(
          method,
          new Promise<void>((resolve) => {
            markSent.set(method, resolve)
          })
        )
      }
      const handler = route('POST', '/rename', () => hold('POST'))
      const read = route('GET', '/me', () => hold('GET'))
      function hold(method: string): Promise<Response> {
        return new Promise<Response>((resolve) => {
          releases.set(method, resolve)
          markSent.get(method)?.()
        })
      }
      return { releases, sent, handlers: [handler, read] }
    }

    function twoSessions() {
      let refreshes = 0
      const session = createSession({
        refresh: async () => {
          refreshes += 1
          return tokens({ accessToken: 'access-refreshed' })
        },
        revoke: async () => {},
      })
      session.start(tokens({ accessToken: 'access-A' }))
      return { session, refreshes: () => refreshes }
    }

    test('a token_expired for a POST and a GET made as A is not replayed as B', async () => {
      const { session, refreshes } = twoSessions()
      const { releases, sent, handlers } = gated()
      const { http, calls } = client(handlers, { authorizer: session, retries: 2 })
      const post = failureOf(
        http.request({ method: 'POST', path: '/rename', auth: true, body: {} })
      )
      const get = failureOf(http.request({ path: '/me', auth: true }))
      await Promise.all([sent.get('POST'), sent.get('GET')])
      await session.signOut()
      session.start(tokens({ accessToken: 'access-B' }))
      releases.get('POST')?.(failure(401, ERRORS['auth.token_expired'].code))
      releases.get('GET')?.(failure(401, ERRORS['auth.token_expired'].code))
      for (const error of [await post, await get]) {
        expect([error.code, error.status]).toEqual([ERRORS['auth.unauthenticated'].code, 401])
      }
      expect(calls).toHaveLength(2)
      expect(calls.map((call) => call.headers.get('authorization'))).toEqual([
        'Bearer access-A',
        'Bearer access-A',
      ])
      expect(refreshes()).toBe(0)
      expect(session.getSnapshot().status).toBe('signed_in')
      expect(await session.accessToken()).toBe('access-B')
    })

    test('a success that arrives for A after B signed in is discarded, not returned', async () => {
      const { session } = twoSessions()
      const { releases, sent, handlers } = gated()
      const { http } = client(handlers, { authorizer: session })
      const get = failureOf(http.request({ path: '/me', auth: true }))
      await sent.get('GET')
      await session.signOut()
      session.start(tokens({ accessToken: 'access-B' }))
      releases.get('GET')?.(json(200, { organization: 'A only' }))
      expect((await get).code).toBe(ERRORS['auth.unauthenticated'].code)
      expect(session.getSnapshot().status).toBe('signed_in')
    })

    test('a refresh inside one session still retries once, as before', async () => {
      const { session, refreshes } = twoSessions()
      const { http, calls } = client(
        [
          route('GET', '/me', (call) =>
            call.headers.get('authorization') === 'Bearer access-A'
              ? failure(401, ERRORS['auth.token_expired'].code)
              : json(200, { ok: true })
          ),
        ],
        { authorizer: session }
      )
      expect(await http.request({ path: '/me', auth: true })).toEqual({ ok: true })
      expect(refreshes()).toBe(1)
      expect(calls).toHaveLength(2)
    })

    test('a request waiting on an expiring token is not sent as B when B signs in during the wait', async () => {
      let started: () => void = () => {}
      const refreshStarted = new Promise<void>((resolve) => {
        started = resolve
      })
      let releaseRefresh: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        releaseRefresh = resolve
      })
      const session = createSession({
        refresh: async () => {
          started()
          await gate
          return tokens({ accessToken: 'access-late' })
        },
        revoke: async () => {},
      })
      // Nearly expired, so the first thing the request does is wait for a refresh.
      session.start(tokens({ accessToken: 'access-A', ttlMs: 1000 }))
      const { http, calls } = client([route('POST', '/rename', json(200, { ok: true }))], {
        authorizer: session,
      })
      const post = failureOf(
        http.request({ method: 'POST', path: '/rename', auth: true, body: {} })
      )
      await refreshStarted
      await session.signOut()
      session.start(tokens({ accessToken: 'access-B' }))
      releaseRefresh()
      expect((await post).code).toBe(ERRORS['auth.unauthenticated'].code)
      expect(calls).toHaveLength(0)
      expect(session.getSnapshot().status).toBe('signed_in')
    })

    test('a retry after token_expired is not sent as B when B signs in during the refresh', async () => {
      let started: () => void = () => {}
      const refreshStarted = new Promise<void>((resolve) => {
        started = resolve
      })
      let releaseRefresh: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        releaseRefresh = resolve
      })
      const session = createSession({
        refresh: async () => {
          started()
          await gate
          return tokens({ accessToken: 'access-late' })
        },
        revoke: async () => {},
      })
      session.start(tokens({ accessToken: 'access-A' }))
      const { http, calls } = client(
        [route('POST', '/rename', failure(401, ERRORS['auth.token_expired'].code))],
        {
          authorizer: session,
        }
      )
      const post = failureOf(
        http.request({ method: 'POST', path: '/rename', auth: true, body: {} })
      )
      await refreshStarted
      await session.signOut()
      session.start(tokens({ accessToken: 'access-B' }))
      releaseRefresh()
      await post
      expect(calls.map((call) => call.headers.get('authorization'))).toEqual(['Bearer access-A'])
      expect(session.getSnapshot().status).toBe('signed_in')
    })

    test('a read retried after a 503 is not sent if the session changed during the wait', async () => {
      const { session } = twoSessions()
      let slept = 0
      const { http, calls } = client([route('GET', '/me', failure(503, 'server.unavailable'))], {
        authorizer: session,
        sleep: async () => {
          slept += 1
          await session.signOut()
          session.start(tokens({ accessToken: 'access-B' }))
        },
      })
      const error = await failureOf(http.request({ path: '/me', auth: true }))
      expect(slept).toBe(1)
      expect(calls).toHaveLength(1)
      expect(error.code).toBe(ERRORS['auth.unauthenticated'].code)
      expect(session.getSnapshot().status).toBe('signed_in')
    })

    test('the cache never holds what A fetched once B is signed in', async () => {
      let answer: (response: Response) => void = () => {}
      const late = new Promise<Response>((resolve) => {
        answer = resolve
      })
      let markSent: () => void = () => {}
      const waitForSend = new Promise<void>((resolve) => {
        markSent = resolve
      })
      const gate = fakeFetch(
        route('GET', '/v1/organization', () => {
          markSent()
          return late
        })
      )
      const gatedApp = createApp({
        env: TEST_ENV,
        reporter: noopReporter,
        fetch: gate.fetch,
        sleep: noWait,
        random: () => 0,
      })
      gatedApp.session.start(tokens({ accessToken: 'access-A' }))
      const fetching = gatedApp.queryClient
        .fetchQuery({
          queryKey: ['organization'],
          queryFn: ({ signal }) => gatedApp.core.getOrganization(signal),
        })
        .catch((error: unknown) => error)
      await waitForSend
      await gatedApp.session.signOut()
      gatedApp.session.start(tokens({ accessToken: 'access-B' }))
      answer(json(200, organizationBody('A Corp')))
      const outcome = await fetching
      // Sign-out cancels the in-flight query; either way the person gets an error, never A's data.
      expect(outcome).toBeInstanceOf(Error)
      expect(gatedApp.queryClient.getQueryData(['organization'])).toBeUndefined()
      expect(
        JSON.stringify(
          gatedApp.queryClient
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data)
        )
      ).not.toContain('A Corp')
    })
  })
})

describe('uploads and per-call options', () => {
  test('a FormData body is sent as it is, with no JSON content type, and the status reaches parse', async () => {
    const form = new FormData()
    form.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    const { http, calls } = client([route('POST', '/up', () => json(201, { ok: true }))])
    const seen = await http.request({
      method: 'POST',
      path: '/up',
      body: form,
      parse: (_json, status) => status,
    })
    expect(seen).toBe(201)
    expect(calls[0]?.init.body).toBe(form)
    expect(calls[0]?.headers.get('content-type')).toBeNull()
  })

  test('a call can ask for a longer timeout than the default', async () => {
    let signal: AbortSignal | undefined
    const http = createHttpClient({
      timeoutMs: 5,
      retries: 0,
      fetch: (_url, init) =>
        new Promise((resolve, reject) => {
          signal = init.signal ?? undefined
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
          setTimeout(() => resolve(json(200, { done: true })), 40)
        }),
    })
    expect(await http.request({ path: '/slow', timeoutMs: 5_000 })).toEqual({ done: true })
    expect(signal?.aborted).toBe(false)
    const error = await failureOf(http.request({ path: '/slow' }))
    expect(error.code).toBe(CLIENT_ERRORS.timeout)
  })
})

describe('sendWithProgress', () => {
  class FakeXhr {
    static last: FakeXhr
    static sends = 0
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
    status = 201
    responseText = '{"ok":true}'
    responseURL = new URL('/v1/x', location.href).href
    responseType = ''
    withCredentials = true
    headers: Record<string, string> = {}
    body: unknown
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    constructor() {
      FakeXhr.last = this
    }
    open() {}
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value
    }
    getAllResponseHeaders() {
      return 'content-type: application/json\r\n'
    }
    send(body: unknown) {
      FakeXhr.sends += 1
      this.body = body
    }
    abort() {
      this.onabort?.()
    }
  }
  const original = globalThis.XMLHttpRequest
  beforeEach(() => {
    FakeXhr.sends = 0
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
  })
  afterEach(() => {
    globalThis.XMLHttpRequest = original
  })

  test('hands the FormData over as it is, reports progress and answers like fetch', async () => {
    const form = new FormData()
    const seen: number[] = []
    const answer = sendWithProgress(
      '/v1/x',
      { method: 'POST', body: form, headers: { a: 'b' } },
      (sent) => seen.push(sent)
    )
    FakeXhr.last.upload.onprogress?.({
      lengthComputable: true,
      loaded: 5,
      total: 10,
    } as ProgressEvent)
    FakeXhr.last.onload?.()
    const response = await answer
    expect(FakeXhr.last.body).toBe(form)
    expect(FakeXhr.last.headers).toEqual({ a: 'b' })
    expect(seen).toEqual([5])
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
  })

  test('an answer from another address (a redirect) is refused', async () => {
    const answer = sendWithProgress('/v1/x', { method: 'POST' }, () => undefined)
    FakeXhr.last.responseURL = 'http://elsewhere.test/v1/x'
    FakeXhr.last.onload?.()
    await expect(answer).rejects.toThrow()
  })

  test('an empty responseURL is a failure, not a pass', async () => {
    const answer = sendWithProgress('/v1/x', { method: 'POST' }, () => undefined)
    FakeXhr.last.responseURL = ''
    FakeXhr.last.onload?.()
    await expect(answer).rejects.toThrow()
  })

  test('an already-aborted signal rejects at once and sends nothing', async () => {
    const controller = new AbortController()
    controller.abort()
    const answer = sendWithProgress(
      '/v1/x',
      { method: 'POST', body: new FormData(), signal: controller.signal },
      () => undefined
    )
    await expect(answer).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeXhr.sends).toBe(0)
  })

  test('an abort rejects with AbortError', async () => {
    const controller = new AbortController()
    const answer = sendWithProgress(
      '/v1/x',
      { method: 'POST', signal: controller.signal },
      () => undefined
    )
    controller.abort()
    await expect(answer).rejects.toMatchObject({ name: 'AbortError' })
  })
})
