/** Keys whose value is dropped from an error report, wherever they appear. */
const SENSITIVE_KEY =
  /token|password|passwd|code|email|authorization|cookie|secret|credential|attempt|invitation|session|identifier/i

const MAX_DEPTH = 12

/** Keys whose string value is an identifier the event needs to be delivered: left as it is. */
const IDENTIFIER_KEY = /^(event_id|release|trace_id|span_id|parent_span_id|debug_id|code_id)$/

/** Keys that hold a script address; only its query and fragment are cut. */
const ADDRESS_KEY = /^(filename|abs_path)$/

const URL_SHAPED = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>)\]]+/gi
const QUERY_OR_FRAGMENT = /[?#].*$/s
const USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i
const KEYED_QUERY_OR_FRAGMENT = /[?#][A-Za-z0-9_.-]+=[^\s'"<>)\]]*/g
const TOKEN_SHAPED = /[A-Za-z0-9_-]{32,}/g

function redactUrl(match: string): string {
  return match.replace(USERINFO, '$1').replace(QUERY_OR_FRAGMENT, '')
}

/** Cuts the query and fragment off a script address, whatever its scheme. */
function stripAddress(value: string): string {
  return value.replace(QUERY_OR_FRAGMENT, '')
}

/** Removes URL queries, fragments and credentials, and token-shaped runs, from free text. */
function scrubText(value: string): string {
  return value
    .replace(URL_SHAPED, redactUrl)
    .replace(KEYED_QUERY_OR_FRAGMENT, '')
    .replace(TOKEN_SHAPED, '[redacted]')
}

/** Reduces a URL to its origin and path: no query, no fragment, no credentials. */
export function stripUrl(value: string): string {
  try {
    const url = new URL(value, 'http://placeholder.invalid')
    const origin = url.origin === 'http://placeholder.invalid' ? '' : url.origin
    return `${origin}${url.pathname}`
  } catch {
    return '[removed]'
  }
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return '[truncated]'
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        continue
      }
      if (typeof inner === 'string') {
        clean[key] = IDENTIFIER_KEY.test(key)
          ? inner
          : scrubText(ADDRESS_KEY.test(key) ? stripAddress(inner) : inner)
      } else {
        clean[key] = scrubValue(inner, depth + 1)
      }
    }
    return clean
  }
  return typeof value === 'string' ? scrubText(value) : value
}

/**
 * Removes what an error report must never carry: request and user data, breadcrumbs, extra data
 * and any field named like a token, password, code, email or authorization; URLs (in the request,
 * in stack frames and inside any text) lose their query, fragment and credentials, and any run of
 * 32 or more URL-safe characters in a string is replaced. Returns a new object.
 */
export function scrubEvent<T extends object>(event: T): T {
  const clean = scrubValue(event, 0) as Record<string, unknown>
  for (const key of ['user', 'breadcrumbs', 'extra', 'server_name']) {
    delete clean[key]
  }
  const request = clean.request
  if (request !== null && typeof request === 'object') {
    const { url } = request as { url?: unknown }
    clean.request = typeof url === 'string' ? { url: stripUrl(url) } : {}
  }
  if (typeof clean.transaction === 'string' && clean.transaction.includes('/')) {
    clean.transaction = stripUrl(clean.transaction)
  }
  return clean as T
}
