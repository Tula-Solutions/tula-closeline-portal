/** Keys whose value is dropped from an error report, wherever they appear. */
const SENSITIVE_KEY =
  /token|password|passwd|code|email|authorization|cookie|secret|credential|attempt|invitation|session|identifier/i

const MAX_DEPTH = 12

/** Sentry's debug metadata, which links a frame to its binary: named like a code but not secret. */
const KEPT_KEY = /^(code_file|code_id)$/

/** Keys whose string value is an identifier the event needs to be delivered: left as it is. */
const IDENTIFIER_KEY = /^(event_id|release|trace_id|debug_id|code_id)$/

/** Keys that hold a script address; only its query and fragment are cut. */
const ADDRESS_KEY = /^(filename|abs_path|code_file)$/

/** No string in a report is longer than this; the scrubbing patterns never see more. */
const MAX_STRING = 2000

// The scheme is at most 32 characters, so each start position scans a bounded stretch: linear.
const URL_SHAPED = /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s'"<>)\]]+/gi
const QUERY_OR_FRAGMENT = /[?#].*$/s
const USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i
const KEYED_QUERY_OR_FRAGMENT = /[?#][A-Za-z0-9_.-]+=[^\s'"<>)\]]*/g
const TOKEN_SHAPED = /[A-Za-z0-9_-]{32,}/g
/** The public booking link carries its secret token as the last path segment. */
const BOOKING_LINK = /\/book\/[^/?#\s'"<>)\]]+/g
const BOOKING_LINK_MASK = '/book/[redacted]'

function redactUrl(match: string): string {
  return match.replace(USERINFO, '$1').replace(QUERY_OR_FRAGMENT, '')
}

/** Cuts the query and fragment off a script address, whatever its scheme. */
function stripAddress(value: string): string {
  return value.replace(QUERY_OR_FRAGMENT, '')
}

function hex(code: number, width: number): string {
  return code.toString(16).padStart(width, '0')
}

/** The ways a literal secret can be written into text: plain, percent-encoded, JSON- or unicode-escaped. */
export function secretForms(secret: string): string[] {
  const units = [...secret].map((char) => char.charCodeAt(0))
  const forms = new Set<string>([
    secret,
    encodeURIComponent(secret),
    JSON.stringify(secret).slice(1, -1),
    units.map((unit) => `%${hex(unit, 2).toUpperCase()}`).join(''),
    units.map((unit) => `%${hex(unit, 2)}`).join(''),
    units.map((unit) => `\\u${hex(unit, 4)}`).join(''),
    units.map((unit) => `\\u${hex(unit, 4).toUpperCase()}`).join(''),
  ])
  forms.delete('')
  return [...forms]
}

type TextScrubber = (value: string) => string

/**
 * Builds the string scrubber: held secrets are removed by exact value first, then the string is
 * cut to MAX_STRING, then URL queries, fragments and credentials and token-shaped runs go.
 */
function textScrubber(secrets: readonly string[]): TextScrubber {
  const forms = secrets.flatMap(secretForms)
  return (value) => {
    let text = value
    for (const form of forms) {
      text = text.split(form).join('[redacted]')
    }
    if (text.length > MAX_STRING) {
      text = `${text.slice(0, MAX_STRING)}[truncated]`
    }
    return text
      .replace(BOOKING_LINK, BOOKING_LINK_MASK)
      .replace(URL_SHAPED, redactUrl)
      .replace(KEYED_QUERY_OR_FRAGMENT, '')
      .replace(TOKEN_SHAPED, '[redacted]')
  }
}

/** Reduces a URL to its origin and path: no query, no fragment, no credentials. */
export function stripUrl(value: string): string {
  try {
    const url = new URL(value, 'http://placeholder.invalid')
    const origin = url.origin === 'http://placeholder.invalid' ? '' : url.origin
    return `${origin}${url.pathname.replace(BOOKING_LINK, BOOKING_LINK_MASK)}`
  } catch {
    return '[removed]'
  }
}

function scrubValue(value: unknown, depth: number, scrubText: TextScrubber): unknown {
  if (depth > MAX_DEPTH) {
    return '[truncated]'
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1, scrubText))
  }
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key) && !KEPT_KEY.test(key)) {
        continue
      }
      if (typeof inner === 'string') {
        clean[key] = IDENTIFIER_KEY.test(key)
          ? inner
          : scrubText(ADDRESS_KEY.test(key) ? stripAddress(inner) : inner)
      } else {
        clean[key] = scrubValue(inner, depth + 1, scrubText)
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
 * 32 or more URL-safe characters in a string is replaced. Every given secret is removed by exact
 * value (plain, percent-encoded, JSON- or unicode-escaped) wherever it appears, and no string
 * keeps more than 2,000 characters. Returns a new object.
 */
export function scrubEvent<T extends object>(event: T, secrets: readonly string[] = []): T {
  const clean = scrubValue(event, 0, textScrubber(secrets)) as Record<string, unknown>
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
