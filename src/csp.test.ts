import { describe, expect, test } from 'bun:test'
import { buildCsp, buildHeaders } from '~/csp'
import { parseEnv } from '~/env'

const prod = parseEnv({
  VITE_ENVIRONMENT: 'prod',
  VITE_SENTRY_DSN: 'https://abc123@o1.ingest.sentry.io/42',
})

function directive(policy: string, name: string): string {
  const found = policy.split('; ').find((part) => part.startsWith(`${name} `))
  if (!found) {
    throw new Error(`no ${name} directive in: ${policy}`)
  }
  return found
}

describe('buildCsp', () => {
  test('scripts and styles come only from the page itself, with no unsafe-inline', () => {
    const policy = buildCsp(prod, { meta: true })
    expect(directive(policy, 'script-src')).toBe("script-src 'self'")
    expect(directive(policy, 'style-src')).toBe("style-src 'self'")
    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
    expect(directive(policy, 'default-src')).toBe("default-src 'none'")
  })

  test('connections go to the page itself (auth and core are behind it), to Sentry and to the Voice SDK default edge hosts, and nowhere else', () => {
    const connect = directive(buildCsp(prod, { meta: true }), 'connect-src')
    expect(connect).toBe(
      "connect-src 'self' https://o1.ingest.sentry.io https://eventgw.twilio.com https://eventgw.*.twilio.com wss://voice-js.*.twilio.com"
    )
  })

  test("connect-src has no bare wildcard, scheme or foreign host beyond Sentry and twilio.com, which is what limits an upload's redirect to the same origin (sendWithProgress relies on it)", () => {
    const sources = directive(buildCsp(prod, { meta: true }), 'connect-src')
      .split(' ')
      .slice(1)
    expect(sources[0]).toBe("'self'")
    // Only the Voice SDK's own hosts: signalling per edge (it moves to the edge the server reports) and event reporting per region.
    expect(sources.slice(1)).toEqual([
      'https://o1.ingest.sentry.io',
      'https://eventgw.twilio.com',
      'https://eventgw.*.twilio.com',
      'wss://voice-js.*.twilio.com',
    ])
    expect(sources).not.toContain('*')
    expect(sources.some((source) => /^[a-z]+:$/.test(source))).toBe(false)
  })

  test('with no DSN there is no Sentry origin, only the Twilio hosts', () => {
    const local = parseEnv({
      VITE_ENVIRONMENT: 'local',
    })
    expect(directive(buildCsp(local, { meta: true }), 'connect-src')).toBe(
      "connect-src 'self' https://eventgw.twilio.com https://eventgw.*.twilio.com wss://voice-js.*.twilio.com"
    )
    expect(buildCsp(local, { meta: true })).not.toContain('upgrade-insecure-requests')
    expect(directive(buildCsp(local, { meta: true }), 'media-src')).toBe(
      "media-src 'self' https: http:"
    )
  })

  test.each([
    ['default-src', "default-src 'none'"],
    ['script-src', "script-src 'self'"],
    ['style-src', "style-src 'self'"],
    ['img-src', "img-src 'self'"],
    ['font-src', "font-src 'self'"],
    ['media-src', "media-src 'self' https:"],
    ['manifest-src', "manifest-src 'self'"],
    ['base-uri', "base-uri 'none'"],
    ['form-action', "form-action 'self'"],
    ['object-src', "object-src 'none'"],
    ['upgrade-insecure-requests', 'upgrade-insecure-requests'],
  ])('outside local the policy carries %s exactly', (name, expected) => {
    const policy = buildCsp(prod, { meta: true })
    expect(policy.split('; ')).toContain(expected)
    expect(policy.split('; ').filter((part) => part.startsWith(name))).toEqual([expected])
  })

  test('the policy is exactly these directives and no others', () => {
    expect(buildCsp(prod, { meta: false }).split('; ')).toEqual([
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "media-src 'self' https:",
      "font-src 'self'",
      "connect-src 'self' https://o1.ingest.sentry.io https://eventgw.twilio.com https://eventgw.*.twilio.com wss://voice-js.*.twilio.com",
      "manifest-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
      "frame-ancestors 'none'",
    ])
  })

  test('the header form adds frame-ancestors, which a meta tag ignores', () => {
    expect(buildCsp(prod, { meta: true })).not.toContain('frame-ancestors')
    expect(buildCsp(prod, { meta: false })).toContain("frame-ancestors 'none'")
  })

  test('the headers file carries the policy and the other security headers', () => {
    const headers = buildHeaders(prod)
    expect(headers).toContain(`Content-Security-Policy: ${buildCsp(prod, { meta: false })}`)
    expect(headers).toContain('X-Content-Type-Options: nosniff')
    expect(headers).toContain('Strict-Transport-Security')
    expect(headers.startsWith('/*\n')).toBe(true)
  })
})
