import { ERRORS } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS, clientError, isTransient, parseErrorResponse } from '~/api/errors'

/** The session as the HTTP client sees it: a token to send, a way to renew it, and a way to end it. */
export type Authorizer = {
  /** Changes on every sign-in and sign-out (not on a refresh): a request belongs to the one it started in. */
  epoch(): number
  /** A usable access token (renewed first when about to expire), or null when signed out. */
  accessToken(): Promise<string | null>
  /** Renews the session whose access token was `token` (all callers share one refresh); does nothing if that token is no longer the held one. Throws on failure. */
  refresh(token: string): Promise<void>
  /** Called with the access token that got a 401 a renewal did not fix: ends the session locally only if that token is still the held one. */
  rejected(token: string): void
}

/** Called as an upload body goes out: bytes sent so far and the total, when the browser knows it. */
export type UploadProgress = (sent: number, total: number) => void

/**
 * The part of `fetch` the client uses; tests pass a double. The input is always a same-origin path
 * (`/v1/...`). The third argument is given only for an upload that reports progress: `fetch` has
 * no upload progress, so the default then sends with XMLHttpRequest instead.
 */
export type Fetch = (
  input: string,
  init: RequestInit,
  onProgress?: UploadProgress
) => Promise<Response>

/**
 * Sends a request with XMLHttpRequest so the browser reports how much of the body has gone out.
 * A FormData body is handed over as it is, so a File part is streamed from disk by the browser and
 * never read into memory by the page. It answers with a Response, as `fetch` would, except that
 * XMLHttpRequest cannot take `cache` or `referrerPolicy` (this path adds no referrer-sensitive data:
 * the address is a same-origin path).
 *
 * Redirects: unlike `redirect: 'error'`, XMLHttpRequest follows a redirect first (a 307 or 308
 * resends the body) and this function can only notice afterwards, by comparing `responseURL` with
 * the address asked for, and refuse the answer. What limits the damage is the Content-Security-Policy
 * `connect-src 'self'` (plus the Sentry origin), which keeps the followed request on this origin
 * (`src/csp.test.ts` pins that value). An empty `responseURL` is treated as a failure.
 */
export function sendWithProgress(
  input: string,
  init: RequestInit,
  onProgress: UploadProgress
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    // Like fetch: a request whose signal is already aborted never goes out.
    if (init.signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const request = new XMLHttpRequest()
    request.open(init.method ?? 'POST', input)
    request.responseType = 'text'
    request.withCredentials = false
    for (const [name, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      request.setRequestHeader(name, value)
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total)
      }
    }
    const abort = () => request.abort()
    init.signal?.addEventListener('abort', abort, { once: true })
    const done = () => init.signal?.removeEventListener('abort', abort)
    request.onload = () => {
      done()
      // XMLHttpRequest follows redirects (and would resend the body); refuse an answer from anywhere else, as `redirect: 'error'` does.
      if (
        request.responseURL === '' ||
        request.responseURL !== new URL(input, location.href).href
      ) {
        reject(new TypeError('redirected'))
        return
      }
      const headers = new Headers()
      for (const line of request.getAllResponseHeaders().trim().split(/\r?\n/)) {
        const at = line.indexOf(':')
        if (at > 0) {
          headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim())
        }
      }
      const noBody = request.status === 204 || request.status === 205 || request.status === 304
      resolve(
        new Response(noBody ? null : request.responseText, { status: request.status, headers })
      )
    }
    request.onerror = () => {
      done()
      reject(new TypeError('network'))
    }
    request.onabort = () => {
      done()
      reject(new DOMException('aborted', 'AbortError'))
    }
    request.send((init.body ?? null) as XMLHttpRequestBodyInit | null)
  })
}

/** How a client is set up; everything is injectable so tests need no network, timers or randomness. */
export type HttpConfig = {
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
  /** Called with each response as it arrives, before it is read (the session learns the server's clock from it). */
  readonly onResponse?: (response: Response) => void
}

/** One call. `auth` sends the access token; reads (GET) may be retried, everything else is sent once. */
export type RequestOptions<T> = {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly path: string
  readonly query?: Readonly<Record<string, string | number | undefined>>
  /** A JSON value, or a `FormData` (an upload), which is sent as it is with the browser's own multipart type. */
  readonly body?: unknown
  /** This call's timeout, for one that legitimately takes longer than the client's default (an upload). */
  readonly timeoutMs?: number
  readonly headers?: Readonly<Record<string, string>>
  /** For a `FormData` upload: called as the body goes out (and makes the call use XMLHttpRequest, since `fetch` has no upload progress). */
  readonly onUploadProgress?: UploadProgress
  readonly auth?: boolean
  readonly signal?: AbortSignal
  /** The answer is plain text (a CSV), not JSON: it is read as text and handed to `parse` as a string. */
  readonly text?: boolean
  /** Checks and narrows the JSON answer (and sees the status, for a route with two success codes); a throw becomes `client.bad_response`. */
  readonly parse?: (json: unknown, status: number) => T
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
  const send: Fetch =
    config.fetch ??
    ((input, init, onProgress) =>
      onProgress ? sendWithProgress(input, init, onProgress) : globalThis.fetch(input, init))

  async function attempt<T>(options: RequestOptions<T>, token: string | null): Promise<T> {
    // Same origin only: a path such as `/v1/organization`, never a URL with a host (and never
    // `//host`, which a browser reads as one).
    if (!options.path.startsWith('/') || options.path.startsWith('//')) {
      throw new Error('An API path must start with a single slash')
    }
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        query.set(key, String(value))
      }
    }
    const queryText = query.toString()
    const url = queryText === '' ? options.path : `${options.path}?${queryText}`
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...config.headers,
      ...options.headers,
    }
    const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
    if (options.body !== undefined && !isForm) {
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
    }, options.timeoutMs ?? timeoutMs)
    const abortFromCaller = () => controller.abort()
    if (options.signal?.aborted) {
      controller.abort()
    }
    options.signal?.addEventListener('abort', abortFromCaller, { once: true })

    try {
      const response = await send(
        url,
        {
          method: options.method ?? 'GET',
          headers,
          ...(options.body === undefined
            ? {}
            : { body: isForm ? (options.body as FormData) : JSON.stringify(options.body) }),
          // The refresh cookie rides along on this origin only; never `include`.
          credentials: 'same-origin',
          // A redirect would resend the body (a refresh token, a password) to wherever it points.
          redirect: 'error',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        },
        isForm ? options.onUploadProgress : undefined
      )
      config.onResponse?.(response)
      if (!response.ok) {
        throw await parseErrorResponse(response)
      }
      if (response.status === 204) {
        return undefined as T
      }
      const json: unknown = options.text ? await response.text() : await response.json()
      try {
        return options.parse ? options.parse(json, response.status) : (json as T)
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

  async function authorized<T>(options: RequestOptions<T>, epoch: number): Promise<T> {
    const authorizer = config.authorizer
    if (!options.auth || authorizer === undefined) {
      return attempt(options, null)
    }
    // A request never outlives the session it started in (`epoch` was taken once, in `request`):
    // after any wait, a changed epoch means the person signed out (and maybe in again), so nothing
    // is sent again and nothing is returned.
    const sameSession = () => authorizer.epoch() === epoch
    const token = await authorizer.accessToken()
    if (token === null || !sameSession()) {
      throw new ApiError({ code: ERRORS['auth.unauthenticated'].code, status: 401 })
    }
    let result: T
    try {
      result = await attempt(options, token)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error
      }
      if (!sameSession()) {
        throw new ApiError({ code: ERRORS['auth.unauthenticated'].code, status: 401 })
      }
      // Any 401 from the service gets one refresh and one retry (the token may have been revoked
      // or rotated, not only expired). A refresh refused for good ends the session and rethrows.
      await authorizer.refresh(token)
      const renewed = await authorizer.accessToken()
      if (renewed === null || !sameSession()) {
        throw error
      }
      try {
        const second = await attempt(options, renewed)
        if (!sameSession()) {
          throw new ApiError({ code: ERRORS['auth.unauthenticated'].code, status: 401 })
        }
        return second
      } catch (second) {
        if (second instanceof ApiError && second.status === 401 && sameSession()) {
          authorizer.rejected(renewed)
        }
        throw second
      }
    }
    if (!sameSession()) {
      throw new ApiError({ code: ERRORS['auth.unauthenticated'].code, status: 401 })
    }
    return result
  }

  return {
    async request<T>(options: RequestOptions<T>): Promise<T> {
      const isRead = (options.method ?? 'GET') === 'GET'
      const epoch = config.authorizer?.epoch() ?? 0
      for (let tries = 0; ; tries += 1) {
        try {
          return await authorized(options, epoch)
        } catch (error) {
          if (!isRead || tries >= retries || !isTransient(error) || options.signal?.aborted) {
            throw error
          }
          const hinted = error instanceof ApiError ? error.retryAfterSeconds : undefined
          // A wait longer than the budget is not waited out: the caller sees the error and the wait.
          if (hinted !== undefined && hinted * 1000 > backoffMax) {
            throw error
          }
          const ceiling = Math.min(backoffMax, backoffBase * 2 ** tries)
          await sleep((hinted === undefined ? 0 : hinted * 1000) + random() * ceiling)
        }
      }
    },
  }
}
