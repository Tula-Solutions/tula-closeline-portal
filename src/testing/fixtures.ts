import type { SessionTokens } from '~/api/auth'
import type { Fetch, UploadProgress } from '~/api/http'
import { parseEnv } from '~/env'

/** The configuration the tests run with. */
export const TEST_ENV = parseEnv({
  VITE_ENVIRONMENT: 'local',
})

/** A JSON response. */
export function json(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** A contract error response with an `area.reason` code. */
export function failure(
  status: number,
  code: string,
  details?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Response {
  return json(
    status,
    { error: { code, message: 'Text the portal never shows.', ...(details ? { details } : {}) } },
    headers
  )
}

/** The session as the auth service returns it to a browser (no refresh token); the access token expires `ttlMs` after `now`. */
export function tokens(
  overrides: Partial<SessionTokens> & { now?: number; ttlMs?: number } = {}
): SessionTokens {
  const { now = Date.now(), ttlMs = 60_000, ...rest } = overrides
  return {
    sessionId: 'ses_1',
    accessToken: 'access-1',
    accessTokenExpiresAt: new Date(now + ttlMs).toISOString(),
    organization: { id: 'org_1', role: 'owner' },
    ...rest,
  }
}

/** One recorded call to the fetch double. */
export type Call = {
  readonly method: string
  readonly url: string
  readonly path: string
  readonly headers: Headers
  readonly body: unknown
  readonly init: RequestInit
  /** Given only for an upload that reports progress; a handler may call it to simulate bytes going out. */
  readonly progress: UploadProgress | undefined
}

/** A handler answers a call with a Response, or null to say it has no route for it. */
export type Handler = (call: Call) => Response | Promise<Response> | null

/** A fetch double that records every call and answers with the first handler that claims it. */
export function fakeFetch(...handlers: Handler[]) {
  const calls: Call[] = []
  const fetchDouble: Fetch = async (input, init, onProgress) => {
    // Like the real fetch: a request whose signal is already aborted never goes out.
    if (init.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    const call: Call = {
      method: init.method ?? 'GET',
      url: input,
      path: new URL(input, 'http://same-origin.test').pathname,
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      init,
      progress: onProgress,
    }
    calls.push(call)
    for (const handler of handlers) {
      const answer = handler(call)
      if (answer !== null) {
        return answer
      }
    }
    throw new Error(`fakeFetch: no route for ${call.method} ${call.url}`)
  }
  return { fetch: fetchDouble, calls }
}

/** A handler for one route. */
export function route(
  method: string,
  path: string,
  answer: Response | ((call: Call) => Response | Promise<Response>)
): Handler {
  return (call) =>
    call.method === method && call.path === path
      ? typeof answer === 'function'
        ? answer(call)
        : answer.clone()
      : null
}
