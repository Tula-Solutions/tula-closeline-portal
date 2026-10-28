import { type Env, originOf } from './env.ts'

/** Builds the Content-Security-Policy for the static build; `meta` drops the directives a `<meta>` tag ignores. */
export function buildCsp(env: Env, options: { readonly meta: boolean }): string {
  // Auth and core are reached through this origin, so 'self' covers them.
  const connect = ["'self'"]
  if (env.sentryDsn !== undefined) {
    connect.push(originOf(env.sentryDsn))
  }
  // The Voice SDK's default (roaming) edge: signalling over wss, event reporting over https.
  // Pinned in voice-device.ts; choosing another edge needs its own hosts here.
  connect.push(
    'https://eventgw.twilio.com',
    'https://eventgw.roaming.twilio.com',
    'wss://voice-js.roaming.twilio.com'
  )
  const directives: string[] = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${[...new Set(connect)].join(' ')}`,
    // The SDK's ring and tone files.
    'media-src https://sdk.twilio.com',
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
