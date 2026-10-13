/** Keys whose value is dropped from an error report, wherever they appear. */
const SENSITIVE_KEY =
  /token|password|passwd|code|email|authorization|cookie|secret|credential|attempt|invitation|session|identifier/i

const MAX_DEPTH = 12

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
      if (!SENSITIVE_KEY.test(key)) {
        clean[key] = scrubValue(inner, depth + 1)
      }
    }
    return clean
  }
  return value
}

/**
 * Removes what an error report must never carry: request and user data, breadcrumbs, extra data
 * and any field named like a token, password, code, email or authorization; URLs lose their query
 * and fragment. Returns a new object.
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
