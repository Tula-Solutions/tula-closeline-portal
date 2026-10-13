import { ApiError, CLIENT_ERRORS, clientError, isTransient, parseErrorResponse } from '~/api/errors'

/** The session as the HTTP client sees it: a token to send, a way to renew it, and a way to end it. */
export type Authorizer = {
  /** A usable access token (renewed first when about to expire), or null when signed out. */
  accessToken(): Promise<string | null>
  /** Renews the session whose access token was `token`; does nothing if that token is no longer the held one. Throws on failure. */
  refresh(token: string): Promise<void>
  /** Called with the access token that got a 401 renewing cannot fix: ends the session only if that token is still the held one. */
  rejected(token: string): void
}

/** The part of `fetch` the client uses; tests pass a double. */
export type Fetch = (input: URL, init: RequestInit) => Promise<Response>

/** How a client is set up; everything is injectable so tests need no network, timers or randomness. */
export type HttpConfig = {
  readonly baseUrl: string
  readonly fetch?: Fetch
  readonly timeoutMs?: number
  /** Extra tries for a read after a timeout, no answer, or 502/503/504. Writes never retry. */
  readonly retries?: number
  readonly backoffBaseMs?: number
  readonly backoffMaxMs?: number
  readonly random?: () => number
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly authorizer?: Authorizer
  readonly headers?: Readonly<Record<string, string>>
}

/** One call. `auth` sends the access token; reads (GET) may be retried, everything else is sent once. */
export type RequestOptions<T> = {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly path: string
  readonly query?: Readonly<Record<string, string | number | undefined>>
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly auth?: boolean
  readonly signal?: AbortSignal
  /** Checks and narrows the JSON answer; a throw becomes `client.bad_response`. */
  readonly parse?: (json: unknown) => T
}

/** A thin typed client over fetch. */
export type HttpClient = {
  /** Sends one call and returns its parsed answer, or throws an ApiError. */
  request<T = unknown>(options: RequestOptions<T>): Promise<T>
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = 2

/** Creates the HTTP client for one service: a timeout on every call, retries for reads only, errors as ApiError. */
export function createHttpClient(config: HttpConfig): HttpClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = config.retries ?? DEFAULT_RETRIES
  const backoffBase = config.backoffBaseMs ?? 200
  const backoffMax = config.backoffMaxMs ?? 2000
  const random = config.random ?? Math.random
  const sleep =
    config.sleep ?? ((milliseconds) => new Promise<void>((done) => setTimeout(done, milliseconds)))
  const send: Fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init))

  async function attempt<T>(options: RequestOptions<T>, token: string | null): Promise<T> {
    const url = new URL(`${config.baseUrl}${options.path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...config.headers,
      ...options.headers,
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    if (token !== null) {
      headers.authorization = `Bearer ${token}`
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const abortFromCaller = () => controller.abort()
    if (options.signal?.aborted) {
      controller.abort()
    }
    options.signal?.addEventListener('abort', abortFromCaller, { once: true })

    try {
      const response = await send(url, {
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      })
      if (!response.ok) {
        throw await parseErrorResponse(response)
      }
      if (response.status === 204) {
        return undefined as T
      }
      const json: unknown = await response.json()
      try {
        return options.parse ? options.parse(json) : (json as T)
      } catch {
        throw clientError(CLIENT_ERRORS.badResponse, response.status)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      if (options.signal?.aborted && !timedOut) {
        throw error
      }
      throw clientError(timedOut ? CLIENT_ERRORS.timeout : CLIENT_ERRORS.network)
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  async function authorized<T>(options: RequestOptions<T>): Promise<T> {
    const authorizer = config.authorizer
    if (!options.auth || authorizer === undefined) {
      return attempt(options, null)
    }
    const token = await authorizer.accessToken()
    if (token === null) {
      throw new ApiError({ code: 'auth.unauthenticated', status: 401 })
    }
    try {
      return await attempt(options, token)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error
      }
      if (error.code !== 'auth.token_expired') {
        authorizer.rejected(token)
        throw error
      }
      // One refresh and one retry. A failed refresh ends the session itself and rethrows.
      await authorizer.refresh(token)
      const renewed = await authorizer.accessToken()
      if (renewed === null) {
        throw error
      }
      try {
        return await attempt(options, renewed)
      } catch (second) {
        if (second instanceof ApiError && second.status === 401) {
          authorizer.rejected(renewed)
        }
        throw second
      }
    }
  }

  return {
    async request<T>(options: RequestOptions<T>): Promise<T> {
      const isRead = (options.method ?? 'GET') === 'GET'
      for (let tries = 0; ; tries += 1) {
        try {
          return await authorized(options)
        } catch (error) {
          if (!isRead || tries >= retries || !isTransient(error) || options.signal?.aborted) {
            throw error
          }
          const hinted = error instanceof ApiError ? error.retryAfterSeconds : undefined
          const ceiling = Math.min(backoffMax, backoffBase * 2 ** tries)
          await sleep(
            hinted === undefined ? random() * ceiling : Math.min(hinted * 1000, backoffMax)
          )
        }
      }
    },
  }
}
