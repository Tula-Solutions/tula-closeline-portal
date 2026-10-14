/** The longest address kept as a place to return to after sign-in. */
const MAX_RETURN_LENGTH = 512

/** Pages a person is never sent back to: the ones for people who are not signed in. */
const PUBLIC_PATHS = ['/sign-in', '/sign-up']

/**
 * A `redirect` search value if (and only if) it is a relative address of this portal: it starts
 * with one slash, has no backslash, control character or scheme, and is not a sign-in page.
 * Anything else (another site, `//host`, `javascript:`) is dropped, so a link cannot send a
 * person elsewhere after they sign in.
 */
export function parseReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RETURN_LENGTH) {
    return undefined
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return undefined
  }
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\\' || code < 0x20 || code === 0x7f) {
      return undefined
    }
  }
  const path = value.split(/[?#]/, 1)[0] ?? ''
  if (PUBLIC_PATHS.some((blocked) => path === blocked || path.startsWith(`${blocked}/`))) {
    return undefined
  }
  return value
}
