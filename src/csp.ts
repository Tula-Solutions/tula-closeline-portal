import { type Env, originOf } from './env'

/** Builds the Content-Security-Policy for the static build; `meta` drops the directives a `<meta>` tag ignores. */
export function buildCsp(env: Env, options: { readonly meta: boolean }): string {
  const connect = ["'self'", originOf(env.authBaseUrl), originOf(env.coreBaseUrl)]
  if (env.sentryDsn !== undefined) {
    connect.push(originOf(env.sentryDsn))
  }
  const directives: string[] = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${[...new Set(connect)].join(' ')}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ]
  if (env.environment !== 'local') {
    directives.push('upgrade-insecure-requests')
  }
  if (!options.meta) {
    directives.push("frame-ancestors 'none'")
  }
  return directives.join('; ')
}

/** The response headers a host should send with every file, in the `_headers` file format. */
export function buildHeaders(env: Env): string {
  const lines = [
    `Content-Security-Policy: ${buildCsp(env, { meta: false })}`,
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: no-referrer',
    'Permissions-Policy: camera=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy: same-origin',
  ]
  if (env.environment !== 'local') {
    lines.push('Strict-Transport-Security: max-age=63072000; includeSubDomains')
  }
  return `/*\n${lines.map((line) => `  ${line}`).join('\n')}\n`
}
