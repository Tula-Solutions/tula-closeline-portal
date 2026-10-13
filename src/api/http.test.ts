import { describe, expect, test } from 'bun:test'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import { type Authorizer, createHttpClient } from '~/api/http'
import { createSession } from '~/session/session'
import { failure, fakeFetch, json, route, tokens } from '~/testing/fixtures'

const noWait = async () => {}

function client(
  handlers: Parameters<typeof fakeFetch>,
  options: Partial<Parameters<typeof createHttpClient>[0]> = {}
) {
  const double = fakeFetch(...handlers)
  const slept: number[] = []
  const http = createHttpClient({
    baseUrl: 'https://svc.test',
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
      baseUrl: 'https://svc.test',
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
      baseUrl: 'https://svc.test',
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
    expect(call?.init.credentials).toBe('omit')
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
      const http = createHttpClient({ baseUrl: 'https://svc.test', fetch: double.fetch })
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
    expect(calls[0]?.url).toBe('https://svc.test/list?limit=25&q=a+b')
  })

  test('a 204 answer is undefined', async () => {
    const { http } = client([route('POST', '/out', () => new Response(null, { status: 204 }))])
    expect(await http.request({ method: 'POST', path: '/out' })).toBeUndefined()
  })

  test('a failure becomes an ApiError with the contract code, so callers branch on the code', async () => {
    const { http } = client([route('POST', '/x', failure(409, 'flow.invalid_step'))])
    const error = await failureOf(http.request({ method: 'POST', path: '/x' }))
    expect([error.code, error.status]).toEqual(['flow.invalid_step', 409])
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
    refresh = async () => tokens({ accessToken: 'access-2', refreshToken: 'refresh-2' })
  ) {
    let refreshes = 0
    const session = createSession({
      refresh: async (token) => {
        refreshes += 1
        expect(token).toBe('refresh-1')
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
          ? failure(401, 'auth.token_expired')
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
          ? failure(401, 'auth.token_expired')
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
      route('GET', '/me', failure(401, 'auth.token_expired')),
    ])
    const error = await failureOf(http.request({ path: '/me', auth: true }))
    expect(error.code).toBe('auth.token_expired')
    expect(calls).toHaveLength(2)
    expect(refreshes()).toBe(1)
    expect(session.getSnapshot().status).toBe('signed_out')
  })

  test.each(['auth.token_invalid', 'auth.unauthenticated', 'session.revoked'])(
    'any other 401 (%s) signs the user out without a refresh',
    async (code) => {
      const { http, session, refreshes } = signedIn([route('GET', '/me', failure(401, code))])
      await failureOf(http.request({ path: '/me', auth: true }))
      expect(refreshes()).toBe(0)
      expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: true })
    }
  )

  test('a refresh the service refuses signs the user out and surfaces the failure', async () => {
    const { http, session } = signedIn(
      [route('GET', '/me', failure(401, 'auth.token_expired'))],
      async () => {
        throw new ApiError({ code: 'session.reuse_detected', status: 401 })
      }
    )
    const error = await failureOf(http.request({ path: '/me', auth: true }))
    expect(error.code).toBe('session.reuse_detected')
    expect(session.getSnapshot()).toEqual({ status: 'signed_out', ended: true })
  })

  test('a refresh that cannot reach the service keeps the session', async () => {
    const { http, session } = signedIn(
      [route('GET', '/me', failure(401, 'auth.token_expired'))],
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
    }
    const { http, calls } = client([route('GET', '/me', json(200, {}))], { authorizer })
    const error = await failureOf(http.request({ path: '/me', auth: true }))
    expect(error.code).toBe('auth.unauthenticated')
    expect(calls).toHaveLength(0)
    // No token was used, so there is nothing to reject.
    expect(rejected).toEqual([])
  })

  test('a 401 for a request sent before sign-out does not end the next session, or rotate it', async () => {
    let answerA: (response: Response) => void = () => {}
    const lateA = new Promise<Response>((resolve) => {
      answerA = resolve
    })
    let refreshes = 0
    const session = createSession({
      refresh: async () => {
        refreshes += 1
        return tokens()
      },
      revoke: async () => {},
    })
    session.start(tokens({ accessToken: 'access-A', refreshToken: 'refresh-A' }))
    const { http } = client(
      [
        route('GET', '/me', (call) =>
          call.headers.get('authorization') === 'Bearer access-A' ? lateA : json(200, { ok: true })
        ),
      ],
      { authorizer: session, retries: 0 }
    )
    const first = http.request({ path: '/me', auth: true }).catch(() => undefined)
    await session.signOut()
    session.start(tokens({ accessToken: 'access-B', refreshToken: 'refresh-B' }))
    answerA(failure(401, 'auth.token_expired'))
    await first
    expect(session.getSnapshot().status).toBe('signed_in')
    expect(refreshes).toBe(0)
  })
})
